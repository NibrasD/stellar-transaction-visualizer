import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as StellarSdk from "npm:@stellar/stellar-sdk@14.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FunctionSpec {
  name: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ type: string }>;
}

function cleanTypeName(typeName: string): string {
  return typeName
    .replace('scSpecType', '')
    .replace(/^(.)/, (match) => match.toLowerCase());
}

async function fetchFromRPC(contractId: string, rpcUrl: string, networkPassphrase: string): Promise<{ functions: FunctionSpec[] | null; error?: string }> {
  try {
    console.log(`[Edge Function RPC] Fetching contract spec for ${contractId}`);
    console.log(`[Edge Function RPC] Using RPC: ${rpcUrl}`);

    const client = await StellarSdk.contract.Client.from({
      contractId: contractId,
      networkPassphrase: networkPassphrase,
      rpcUrl: rpcUrl,
    });

    console.log('[Edge Function RPC] ✅ Contract client created');

    const spec = client.spec;
    const funcs = spec.funcs();

    console.log(`[Edge Function RPC] Found ${funcs.length} functions`);

    const functions: FunctionSpec[] = funcs.map((fn: any) => {
      const rawName = fn.name();
      const funcName = typeof rawName === 'string' ? rawName :
                       (rawName instanceof Uint8Array ? new TextDecoder().decode(rawName) : String(rawName));

      const inputs = fn.inputs().map((input: any) => {
        const rawInputName = input.name();
        const name = typeof rawInputName === 'string' ? rawInputName :
                     (rawInputName instanceof Uint8Array ? new TextDecoder().decode(rawInputName) : String(rawInputName));

        const type = input.type();
        const typeStr = cleanTypeName(type.switch().name);

        return { name, type: typeStr };
      });

      const outputs = fn.outputs().map((output: any) => ({
        type: cleanTypeName(output.switch().name)
      }));

      console.log(`[Edge Function RPC]   fn ${funcName}(${inputs.map(i => `${i.name}: ${i.type}`).join(', ')})`);

      return {
        name: funcName,
        inputs,
        outputs,
      };
    });

    console.log(`[Edge Function RPC] ✅ Successfully extracted ${functions.length} functions`);
    return { functions: functions.length > 0 ? functions : null };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[Edge Function RPC] ❌ Error:', errorMsg);
    console.error('[Edge Function RPC] Stack:', errorStack);
    return { functions: null, error: errorMsg };
  }
}

async function callTokenFunction(
  contractId: string,
  functionName: string,
  rpcUrl: string,
  networkPassphrase: string
): Promise<string | null> {
  try {
    const contract = new StellarSdk.Contract(contractId);
    const sourceKeypair = StellarSdk.Keypair.random();
    const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), '0');

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: networkPassphrase,
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
        console.log(`[Edge Function] Decoded ${functionName}() result:`, decoded);
        return String(decoded);
      }
    }

    if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
      console.warn(`[Edge Function] Simulation error for ${functionName}():`, simulated.error);
    }
  } catch (e) {
    console.error(`[Edge Function] Exception calling ${functionName}():`, e);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const contractId = url.searchParams.get("contractId");
    const network = url.searchParams.get("network") || "mainnet";
    const method = url.searchParams.get("method") || "rpc";
    const tokenFunction = url.searchParams.get("tokenFunction");

    console.log(`[Edge Function] Called with: contractId=${contractId}, network=${network}, method=${method}, tokenFunction=${tokenFunction}`);

    if (!contractId) {
      return new Response(
        JSON.stringify({ error: "Missing contractId parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rpcUrl = network === "testnet"
      ? "https://soroban-testnet.stellar.org"
      : "https://soroban-rpc.mainnet.stellar.gateway.fm";

    const networkPassphrase = network === "testnet"
      ? "Test SDF Network ; September 2015"
      : "Public Global Stellar Network ; September 2015";

    // Handle token function calls
    if (tokenFunction) {
      console.log(`[Edge Function] Calling token function: ${tokenFunction}`);
      const result = await callTokenFunction(contractId, tokenFunction, rpcUrl, networkPassphrase);

      let normalizedResult = result;
      if (tokenFunction === 'symbol' && result) {
        // SAC contracts for native XLM return "native" as symbol, convert to "XLM"
        if (result.toLowerCase() === 'native' || result.toLowerCase() === 'stellar:native') {
          normalizedResult = 'XLM';
        }
      }

      return new Response(
        JSON.stringify({ value: normalizedResult }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Default to RPC method (most reliable)
    if (method === "rpc" || method === "stellar-expert") {
      console.log(`[Edge Function] Trying RPC method first...`);
      const result = await fetchFromRPC(contractId, rpcUrl, networkPassphrase);

      if (result.functions && result.functions.length > 0) {
        console.log(`[Edge Function] ✅ RPC method succeeded with ${result.functions.length} functions`);
        return new Response(
          JSON.stringify({ functions: result.functions }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // If RPC failed and method was stellar-expert, try that as fallback
      if (method === "stellar-expert") {
        console.log(`[Edge Function] RPC failed with error: ${result.error || 'unknown'}, falling back to StellarExpert...`);
      } else {
        // RPC method failed and no fallback requested - return error details
        return new Response(
          JSON.stringify({
            functions: null,
            error: result.error || 'No functions found',
            debug: {
              contractId,
              network,
              rpcUrl,
              networkPassphrase
            }
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const baseUrl = network === "testnet"
      ? "https://testnet.stellarexpert.io"
      : "https://stellarexpert.io";

    const stellarExpertUrl = `${baseUrl}/contract/${contractId}`;
    console.log(`Fetching from StellarExpert: ${stellarExpertUrl}`);

    const response = await fetch(stellarExpertUrl);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `StellarExpert returned ${response.status}`, functions: null }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const html = await response.text();

    console.log(`[StellarExpert] HTML length: ${html.length} bytes`);

    // Try multiple regex patterns to handle different HTML formats
    const patterns = [
      /fn\s+(\w+)\s*\(([\s\S]*?)\)/g,  // Original with multiline support
      /<span[^>]*>fn<\/span>\s*<span[^>]*>(\w+)<\/span>\s*\(([\s\S]*?)\)/g,  // HTML spans
      /fn[\s\n]+(\w+)[\s\n]*\(([\s\S]*?)\)/g,  // With newlines
    ];

    const functions: FunctionSpec[] = [];
    const foundFunctions = new Set<string>();

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const functionName = match[1];

        // Skip duplicates
        if (foundFunctions.has(functionName)) {
          continue;
        }
        foundFunctions.add(functionName);

        let paramsStr = match[2];

        // Remove HTML tags from parameters
        paramsStr = paramsStr.replace(/<[^>]+>/g, '');
        // Remove extra whitespace and newlines
        paramsStr = paramsStr.replace(/\s+/g, ' ').trim();

        console.log(`[StellarExpert] Found function: ${functionName}(${paramsStr})`);

        const inputs: Array<{ name: string; type: string }> = [];
        if (paramsStr.trim()) {
          const params = paramsStr.split(",").map((p) => p.trim());
          for (const param of params) {
            const colonIdx = param.lastIndexOf(":");
            if (colonIdx > 0) {
              const name = param.substring(0, colonIdx).trim();
              const type = param.substring(colonIdx + 1).trim();
              inputs.push({ name, type });
              console.log(`[StellarExpert]   Param: ${name}: ${type}`);
            }
          }
        }

        functions.push({
          name: functionName,
          inputs,
          outputs: [],
        });
      }
    }

    console.log(`[StellarExpert] ✅ Extracted ${functions.length} functions from ${contractId}`);

    return new Response(
      JSON.stringify({ functions: functions.length > 0 ? functions : null }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching contract spec:", error);
    return new Response(
      JSON.stringify({ error: error.message, functions: null }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});