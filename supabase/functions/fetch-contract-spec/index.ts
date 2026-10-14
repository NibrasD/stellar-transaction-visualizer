import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as StellarSdk from "npm:@stellar/stellar-sdk@14.2.0";
import { createClient } from "npm:@supabase/supabase-js@2.42.0";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://stellar-transaction-visualizer.vercel.app",
]);

const getCorsHeaders = (origin: string | null) => {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.has(origin) ||
    /^https:\/\/stellar-transaction-visualizer(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)
  );

  const allowedOrigin = isAllowed ? origin : "https://stellar-transaction-visualizer.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const ALLOWED_TOKEN_FUNCTIONS = new Set([
  "name",
  "symbol",
  "decimals",
  "balance",
  "allowance",
  "authorized",
  "version",
]);

const RPC_ENDPOINTS = {
  testnet: [
    "https://soroban-testnet.stellar.org",
  ],
  mainnet: [
    "https://mainnet.sorobanrpc.com",
    "https://soroban-rpc.mainnet.stellar.gateway.fm",
  ],
};

const NETWORK_PASSPHRASES = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

interface FunctionSpec {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ type: string }>;
}

function cleanTypeName(typeName: string): string {
  return typeName
    .replace("scSpecType", "")
    .replace(/^(.)/, (match) => match.toLowerCase());
}

function isValidStellarContractId(contractId: string): boolean {
  if (!contractId || typeof contractId !== "string") return false;
  if (!/^C[A-Z0-9]{55}$/.test(contractId)) return false;
  try {
    return StellarSdk.StrKey.isValidContractId(contractId);
  } catch {
    return false;
  }
}

async function fetchFromRPC(
  contractId: string,
  rpcUrls: string[],
  networkPassphrase: string
): Promise<{ functions: FunctionSpec[] | null; error?: string }> {
  let lastError = "RPC unavailable";

  for (const rpcUrl of rpcUrls) {
    try {
      console.log(`[Edge Function RPC] Fetching spec for ${contractId} via ${rpcUrl}`);

      const client = await StellarSdk.contract.Client.from({
        contractId,
        networkPassphrase,
        rpcUrl,
      });

      const spec = client.spec;
      const funcs = spec.funcs();

      const functions: FunctionSpec[] = funcs.map((fn: any) => {
        const rawName = fn.name();
        const funcName = typeof rawName === "string"
          ? rawName
          : (rawName instanceof Uint8Array ? new TextDecoder().decode(rawName) : String(rawName));

        const inputs = fn.inputs().map((input: any) => {
          const rawInputName = input.name();
          const name = typeof rawInputName === "string"
            ? rawInputName
            : (rawInputName instanceof Uint8Array ? new TextDecoder().decode(rawInputName) : String(rawInputName));

          const type = input.type();
          const typeStr = cleanTypeName(type.switch().name);

          return { name, type: typeStr };
        });

        const outputs = fn.outputs().map((output: any) => ({
          type: cleanTypeName(output.switch().name),
        }));

        return {
          name: funcName,
          inputs,
          outputs,
        };
      });

      return { functions: functions.length > 0 ? functions : null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[Edge Function RPC] RPC ${rpcUrl} failed: ${lastError}`);
    }
  }

  return { functions: null, error: lastError };
}

async function callTokenFunction(
  contractId: string,
  functionName: string,
  rpcUrls: string[],
  networkPassphrase: string
): Promise<string | null> {
  for (const rpcUrl of rpcUrls) {
    try {
      const contract = new StellarSdk.Contract(contractId);
      const sourceKeypair = StellarSdk.Keypair.random();
      const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), "0");

      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(contract.call(functionName))
        .setTimeout(30)
        .build();

      const server = new StellarSdk.rpc.Server(rpcUrl);
      const simulated = await server.simulateTransaction(transaction);

      if (StellarSdk.rpc.Api.isSimulationSuccess(simulated)) {
        const result = simulated.result?.retval;
        if (result) {
          const decoded = StellarSdk.scValToNative(result);
          return String(decoded);
        }
      }
    } catch (e) {
      console.warn(`[Edge Function] Error calling ${functionName} via ${rpcUrl}:`, e);
    }
  }
  return null;
}

// Secure server-side caching using Supabase Service Role key
async function cacheMetadataSecurely(
  contractId: string,
  network: string,
  metadata: {
    spec?: any;
    functions?: FunctionSpec[] | null;
    is_token?: boolean;
    token_name?: string | null;
    token_symbol?: string | null;
    token_decimals?: number | null;
  }
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await supabase.from("contract_metadata").upsert({
      contract_id: contractId,
      network,
      spec: metadata.spec ?? (metadata.functions ? { functions: metadata.functions } : null),
      functions: metadata.functions ?? null,
      is_token: metadata.is_token ?? false,
      token_name: metadata.token_name ?? null,
      token_symbol: metadata.token_symbol ?? null,
      token_decimals: metadata.token_decimals ?? null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Edge Function] Error caching metadata securely:", err);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors,
    });
  }

  try {
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contractId");
    const rawNetwork = url.searchParams.get("network") || "mainnet";
    const method = url.searchParams.get("method") || "rpc";
    const tokenFunction = url.searchParams.get("tokenFunction");

    // 1. Strict validation of contractId
    if (!contractId || !isValidStellarContractId(contractId)) {
      return new Response(
        JSON.stringify({ error: "Invalid contractId format. Must be a valid 56-character Stellar StrKey starting with 'C'." }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Strict validation of network
    if (rawNetwork !== "mainnet" && rawNetwork !== "testnet") {
      return new Response(
        JSON.stringify({ error: "Invalid network parameter. Must be 'mainnet' or 'testnet'." }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }
    const network = rawNetwork as "mainnet" | "testnet";
    const rpcUrls = RPC_ENDPOINTS[network];
    const networkPassphrase = NETWORK_PASSPHRASES[network];

    // 3. Strict validation of tokenFunction whitelist
    if (tokenFunction) {
      if (!ALLOWED_TOKEN_FUNCTIONS.has(tokenFunction)) {
        return new Response(
          JSON.stringify({ error: `Function '${tokenFunction}' is not permitted for simulation. Allowed: ${Array.from(ALLOWED_TOKEN_FUNCTIONS).join(', ')}` }),
          {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }

      const result = await callTokenFunction(contractId, tokenFunction, rpcUrls, networkPassphrase);
      let normalizedResult = result;
      if (tokenFunction === "symbol" && result) {
        if (result.toLowerCase() === "native" || result.toLowerCase() === "stellar:native") {
          normalizedResult = "XLM";
        }
      }

      return new Response(
        JSON.stringify({ value: normalizedResult }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Spec fetching via RPC (canonical method)
    const rpcResult = await fetchFromRPC(contractId, rpcUrls, networkPassphrase);

    if (rpcResult.functions && rpcResult.functions.length > 0) {
      // Securely cache via Service Role
      await cacheMetadataSecurely(contractId, network, {
        functions: rpcResult.functions,
      });

      return new Response(
        JSON.stringify({ functions: rpcResult.functions }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    // 5. Fallback via StellarExpert only if requested and contractId is verified
    if (method === "stellar-expert") {
      const baseUrl = network === "testnet"
        ? "https://testnet.stellarexpert.io"
        : "https://stellarexpert.io";

      const stellarExpertUrl = `${baseUrl}/contract/${encodeURIComponent(contractId)}`;
      const response = await fetch(stellarExpertUrl);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `StellarExpert returned ${response.status}`, functions: null }),
          {
            status: response.status,
            headers: { ...cors, "Content-Type": "application/json" },
          }
        );
      }

      const html = await response.text();
      const pattern = /fn\s+(\w+)\s*\(([\s\S]*?)\)/g;
      const functions: FunctionSpec[] = [];
      const foundFunctions = new Set<string>();

      for (const match of html.matchAll(pattern)) {
        const functionName = match[1];
        if (foundFunctions.has(functionName)) continue;
        foundFunctions.add(functionName);

        const paramsStr = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        const inputs: Array<{ name: string; type: string }> = [];

        if (paramsStr) {
          const params = paramsStr.split(",").map((p) => p.trim());
          for (const param of params) {
            const colonIdx = param.lastIndexOf(":");
            if (colonIdx > 0) {
              const name = param.substring(0, colonIdx).trim();
              const type = param.substring(colonIdx + 1).trim();
              inputs.push({ name, type });
            }
          }
        }

        functions.push({
          name: functionName,
          inputs,
          outputs: [],
        });
      }

      if (functions.length > 0) {
        await cacheMetadataSecurely(contractId, network, {
          functions,
        });
      }

      return new Response(
        JSON.stringify({ functions: functions.length > 0 ? functions : null }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        functions: null,
        error: rpcResult.error || "No functions found",
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Edge Function] Error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, functions: null }),
      {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  }
});