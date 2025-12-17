import React, { useState, useRef, useEffect } from 'react';
import { Play, AlertCircle, CheckCircle, Loader, Code, Cpu, Database, RefreshCw, ChevronDown } from 'lucide-react';
import * as StellarSdk from '@stellar/stellar-sdk';
import type { NetworkConfig } from '../types/stellar';
import { simpleContractMetadataService, type ContractMetadata, type FunctionSpec } from '../services/simpleContractMetadata';

// Helper function to serialize objects with BigInt values
function stringifyWithBigInt(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
    space
  );
}

// Map contract input types to standard ScVal types
function mapContractTypeToScValType(contractType: string): StellarSdk.xdr.ScValType {
  const lowerType = contractType.toLowerCase();
  if (lowerType.includes('address')) return StellarSdk.xdr.ScValType.scvAddress();
  if (lowerType.includes('i128')) return StellarSdk.xdr.ScValType.scvI128();
  if (lowerType.includes('u128')) return StellarSdk.xdr.ScValType.scvU128();
  if (lowerType.includes('i64')) return StellarSdk.xdr.ScValType.scvI64();
  if (lowerType.includes('u64')) return StellarSdk.xdr.ScValType.scvU64();
  if (lowerType.includes('i32')) return StellarSdk.xdr.ScValType.scvI32();
  if (lowerType.includes('u32')) return StellarSdk.xdr.ScValType.scvU32();
  if (lowerType.includes('bool')) return StellarSdk.xdr.ScValType.scvBool();
  if (lowerType.includes('symbol')) return StellarSdk.xdr.ScValType.scvSymbol();
  if (lowerType.includes('string')) return StellarSdk.xdr.ScValType.scvString();
  if (lowerType.includes('bytes')) return StellarSdk.xdr.ScValType.scvBytes();
  if (lowerType.includes('vec') || lowerType.includes('array')) return StellarSdk.xdr.ScValType.scvVec();
  if (lowerType.includes('map')) return StellarSdk.xdr.ScValType.scvMap();
  if (lowerType.includes('struct')) return StellarSdk.xdr.ScValType.scvMap();
  return StellarSdk.xdr.ScValType.scvSymbol();
}

interface ContractSimulatorProps {
  networkConfig: NetworkConfig;
}

interface SimulationResult {
  success: boolean;
  result?: any;
  error?: string;
  resourceUsage?: {
    cpuInstructions: number;
    memoryBytes: number;
    ledgerReadBytes: number;
    ledgerWriteBytes: number;
    readLedgerEntries: number;
    writeLedgerEntries: number;
  };
  cost?: {
    totalFee: string;
    resourceFee: string;
  };
  events?: Array<{
    type: string;
    topics: any[];
    data: any;
  }>;
  // Authorization info for UI display
  authRequirements?: {
    requiredAddress: string;
    sourceAccount: string;
    isMismatch: boolean;
    allAuthEntries: any[];
  }
}

export function ContractSimulator({ networkConfig }: ContractSimulatorProps) {
  const [contractId, setContractId] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [args, setArgs] = useState('[]');
  const [sourceAccount, setSourceAccount] = useState('');

  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [contractMetadata, setContractMetadata] = useState<ContractMetadata | null>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FunctionSpec | null>(null);
  const [showFunctionDropdown, setShowFunctionDropdown] = useState(false);
  const functionNameRef = useRef('');

  // Update metadata service network when network changes
  useEffect(() => {
    const rpcUrl = networkConfig.isTestnet
      ? 'https://soroban-testnet.stellar.org'
      : 'https://soroban.stellar.org';
    const network = networkConfig.isTestnet ? 'testnet' : 'mainnet';
    simpleContractMetadataService.setNetwork(network, rpcUrl, networkConfig.networkPassphrase);
  }, [networkConfig]);

  // Fetch contract metadata when contract ID changes
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!contractId || contractId.length < 56) {
        setContractMetadata(null);
        setSelectedFunction(null);
        return;
      }

      setIsFetchingMetadata(true);
      try {
        const metadata = await simpleContractMetadataService.getContractMetadata(contractId);
        setContractMetadata(metadata);

        if (metadata?.functions && functionName) {
          const matchingFunc = metadata.functions.find(f => f.name === functionName);
          setSelectedFunction(matchingFunc || null);
        }
      } catch (error) {
        // Silently ignore metadata fetch errors
      } finally {
        setIsFetchingMetadata(false);
      }
    };

    fetchMetadata();
  }, [contractId, networkConfig]);

  // Update selected function when function name changes
  useEffect(() => {
    if (contractMetadata?.functions && functionName) {
      const matchingFunc = contractMetadata.functions.find(f => f.name === functionName);
      setSelectedFunction(matchingFunc || null);
    } else {
      setSelectedFunction(null);
    }
  }, [functionName, contractMetadata]);

  const handleFunctionSelect = (func: FunctionSpec) => {
    setFunctionName(func.name);
    setSelectedFunction(func);
    setShowFunctionDropdown(false);

    if (func.inputs.length > 0) {
      const exampleArgs = func.inputs.map(input => {
        const lowerType = input.type.toLowerCase();
        if (lowerType.includes('address')) return 'GXXX...';
        if (lowerType.includes('i128') || lowerType.includes('u128')) return '10000000';
        if (lowerType.includes('i64') || lowerType.includes('u64')) return 1000;
        if (lowerType.includes('i32') || lowerType.includes('u32')) return 100;
        if (lowerType.includes('bool')) return true;
        if (lowerType.includes('string') || lowerType.includes('symbol')) return 'my_symbol';
        if (lowerType.includes('vec') || lowerType.includes('array')) return [];
        if (lowerType.includes('map') || lowerType.includes('struct')) return {};
        return null;
      });
      setArgs(JSON.stringify(exampleArgs, null, 2));
    } else {
      setArgs('[]');
    }
  };

  const convertArgToScVal = (arg: any, index: number): StellarSdk.xdr.ScVal => {
    if (!selectedFunction || !selectedFunction.inputs[index]) {
      // Fallback logic when metadata is missing
      if (typeof arg === 'string' && (arg.match(/^G[A-Z0-9]{55}$/) || arg.match(/^C[A-Z0-9]{55}$/))) {
        return StellarSdk.Address.fromString(arg).toScVal();
      }
      if (typeof arg === 'string' && arg.match(/^-?\d+$/)) {
        return StellarSdk.nativeToScVal(BigInt(arg), { type: 'i128' });
      }
      if (typeof arg === 'number' && Number.isInteger(arg) && Math.abs(arg) <= 9007199254740991) {
        return StellarSdk.nativeToScVal(arg, { type: 'i64' });
      }
      if (arg === null || arg === undefined) {
        return StellarSdk.xdr.ScVal.scvVoid();
      }
      return StellarSdk.nativeToScVal(arg);
    }

    const expectedType = selectedFunction.inputs[index].type;
    const scValType = mapContractTypeToScValType(expectedType);

    // Handle Addresses
    if (scValType.name === StellarSdk.xdr.ScValType.scvAddress().name) {
      if (typeof arg !== 'string') {
        throw new Error(`Expected Address (string) for input ${index + 1}, received ${typeof arg}`);
      }
      return StellarSdk.Address.fromString(arg).toScVal();
    }

    // Handle Bytes - convert base64 string or hex string to Uint8Array
    if (scValType.name === StellarSdk.xdr.ScValType.scvBytes().name) {
      if (typeof arg !== 'string') {
        throw new Error(`Expected bytes (base64 or hex string) for input ${index + 1}, received ${typeof arg}`);
      }

      let uint8Array: Uint8Array;
      try {
        // Check if it looks like base64 (contains padding or special chars)
        const isBase64 = arg.includes('=') || arg.includes('+') || arg.includes('/') ||
          (arg.match(/^[A-Za-z0-9+/]+$/) && arg.length % 4 === 0 && arg.length > 20);

        // Check if it's pure hex (only 0-9, a-f, A-F)
        const isHex = /^[0-9a-fA-F]+$/.test(arg) && arg.length % 2 === 0;

        if (isBase64) {
          // Parse as base64
          const binaryString = atob(arg);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          uint8Array = bytes;
        } else if (isHex) {
          // Parse as hex
          const bytes = new Uint8Array(arg.length / 2);
          for (let i = 0; i < arg.length; i += 2) {
            bytes[i / 2] = parseInt(arg.substr(i, 2), 16);
          }
          uint8Array = bytes;
        } else {
          // Treat as plain text
          const encoder = new TextEncoder();
          uint8Array = encoder.encode(arg);
        }
      } catch (e) {
        throw new Error(`Failed to parse bytes for input ${index + 1}: ${e instanceof Error ? e.message : 'Invalid format'}. Provide base64, hex, or plain text.`);
      }

      return StellarSdk.nativeToScVal(uint8Array, { type: 'bytes' });
    }

    // Handle Large Integers (i64, u64, i128, u128)
    if (['scvI64', 'scvU64', 'scvI128', 'scvU128'].includes(scValType.name)) {
      let numericArg: bigint;
      if (typeof arg === 'string') {
        if (!arg.match(/^-?\d+$/)) {
          throw new Error(`Expected number string for ${expectedType} at input ${index + 1}, received non-numeric string`);
        }
        numericArg = BigInt(arg);
      } else if (typeof arg === 'number') {
        if (!Number.isInteger(arg)) {
          throw new Error(`Expected integer for ${expectedType} at input ${index + 1}, received float`);
        }
        numericArg = BigInt(arg);
      } else {
        throw new Error(`Expected number (string or number) for ${expectedType} at input ${index + 1}, received ${typeof arg}`);
      }
      return StellarSdk.nativeToScVal(numericArg, { type: scValType.name.replace('scv', '').toLowerCase() as any });
    }

    // Handle Smaller Integers (i32, u32)
    if (['scvI32', 'scvU32'].includes(scValType.name)) {
      let numericArg: number;
      if (typeof arg === 'string') {
        if (!arg.match(/^-?\d+$/)) {
          throw new Error(`Expected number string for ${expectedType} at input ${index + 1}, received non-numeric string`);
        }
        numericArg = Number(arg);
      } else if (typeof arg === 'number') {
        if (!Number.isInteger(arg)) {
          throw new Error(`Expected integer for ${expectedType} at input ${index + 1}, received float`);
        }
        numericArg = arg;
      } else {
        throw new Error(`Expected number (string or number) for ${expectedType} at input ${index + 1}, received ${typeof arg}`);
      }
      return StellarSdk.nativeToScVal(numericArg, { type: scValType.name.replace('scv', '').toLowerCase() as any });
    }

    // Handle Boolean
    if (scValType.name === StellarSdk.xdr.ScValType.scvBool().name) {
      if (typeof arg !== 'boolean') {
        throw new Error(`Expected boolean for ${expectedType} at input ${index + 1}, received ${typeof arg}`);
      }
      return StellarSdk.nativeToScVal(arg);
    }

    // Handle Void/Null
    if (arg === null || arg === undefined) {
      return StellarSdk.xdr.ScVal.scvVoid();
    }

    // Generic/Complex Types
    return StellarSdk.nativeToScVal(arg, { type: scValType.name.replace('scv', '').toLowerCase() as any });
  };

  const extractEvents = (simulation: any): Array<{ type: string; topics: any[]; data: any }> => {
    return simulation.events?.map((eventWrapper: any) => {
      let event = eventWrapper;

      if (eventWrapper._attributes?.event) {
        event = eventWrapper._attributes.event;
      } else if (eventWrapper.event) {
        event = eventWrapper.event;
      }

      let decodedTopics: any[] = [];
      let decodedData: any = null;
      let eventType = 'contract';

      try {
        const eventBody = event.body();
        const v0 = eventBody.v0();

        if (v0.topics && Array.isArray(v0.topics())) {
          decodedTopics = v0.topics().map((t: StellarSdk.xdr.ScVal) => {
            try {
              return StellarSdk.scValToNative(t);
            } catch (e) {
              return `Unparsable Topic: ${t.toXDR('base64')}`;
            }
          });
        }

        if (v0.data) {
          try {
            decodedData = StellarSdk.scValToNative(v0.data());
          } catch (e) {
            decodedData = `Unparsable Data: ${v0.data().toXDR('base64')}`;
          }
        }

        if (event.type && typeof event.type() === 'object') {
          eventType = (event.type() as any).name.toLowerCase().replace('sce', '');
        } else if (event.inSuccessfulContractCall !== undefined) {
          eventType = event.inSuccessfulContractCall() ? 'contract' : 'diagnostic';
        }
      } catch (e) {
        decodedData = `Raw Event: ${event.toXDR('base64')}`;
      }

      return { type: eventType, topics: decodedTopics, data: decodedData };
    }) || [];
  };

  const extractResourceUsage = (simulation: any) => {
    let cpuInstructions = 0;
    let memoryBytes = 0;
    let ledgerReadBytes = 0;
    let ledgerWriteBytes = 0;
    let readLedgerEntries = 0;
    let writeLedgerEntries = 0;

    // Extract from transactionData - resources is an XDR object with _attributes
    if (simulation.transactionData?._data?._attributes?.resources?._attributes) {
      const resourceAttrs = simulation.transactionData._data._attributes.resources._attributes;

      cpuInstructions = Number(resourceAttrs.instructions || 0);
      ledgerReadBytes = Number(resourceAttrs.diskReadBytes || resourceAttrs.readBytes || 0);
      ledgerWriteBytes = Number(resourceAttrs.writeBytes || 0);
      memoryBytes = ledgerReadBytes + ledgerWriteBytes;

      // Get footprint - it's a function that returns the footprint XDR object
      const resources = simulation.transactionData._data._attributes.resources;
      if (typeof resources.footprint === 'function') {
        try {
          const footprintObj = resources.footprint();

          // Footprint has readOnly() and readWrite() methods
          if (typeof footprintObj.readOnly === 'function' && typeof footprintObj.readWrite === 'function') {
            const readOnly = footprintObj.readOnly() || [];
            const readWrite = footprintObj.readWrite() || [];

            readLedgerEntries = readOnly.length + readWrite.length;
            writeLedgerEntries = readWrite.length;
          }
        } catch (e) {
          // Silently ignore footprint extraction errors
        }
      }
    }

    return {
      cpuInstructions,
      memoryBytes,
      ledgerReadBytes,
      ledgerWriteBytes,
      readLedgerEntries,
      writeLedgerEntries,
    };
  };

  const generateErrorMessage = (error: any, events: any[], functionName: string, selectedFunction: FunctionSpec | null, parsedArgs: any[]): string => {
    let errorMessage = typeof error === 'string' ? error : stringifyWithBigInt(error, 2);
    const functionSignature = selectedFunction
      ? `${selectedFunction.name}(${selectedFunction.inputs.map(input => input.type).join(', ')})`
      : functionName;

    const hasNonExistentFunction = errorMessage.includes('non-existent contract function');
    const hasMismatchingParams = errorMessage.includes('MismatchingParameterLen') || events.some((e: any) =>
      e.data && typeof e.data === 'string' && e.data.includes('MismatchingParameterLen')
    );
    const hasUnreachableCode = errorMessage.includes('UnreachableCodeReached') || events.some((e: any) =>
      e.data && typeof e.data === 'string' && e.data.includes('UnreachableCodeReached')
    );
    const hasTypeMismatch = errorMessage.includes('TypeMismatch');

    if (hasNonExistentFunction) {
      return `Function '${functionName}' does not exist on this contract.\n\n` +
        `Possible reasons:\n` +
        `• The function name is misspelled\n` +
        `• The contract doesn't implement this function\n` +
        `• You're using the wrong contract address\n\n` +
        `Check the contract's documentation or source code for available functions.`;
    }

    if (hasTypeMismatch) {
      return `Argument Type Mismatch for function '${functionSignature}'.\n\n` +
        `The contract execution failed because one of the arguments you provided does not match the expected Soroban type.\n\n` +
        `What to check:\n` +
        `• Ensure large numbers (i64, i128, u128) are passed as **strings** (e.g., "100000000000")\n` +
        `• Verify that you are using the correct Stellar Address format (GXXX... or CXXX...) where expected\n` +
        `• If the contract expects a Map or Vector, ensure your JSON structure matches the contract's definition.`;
    }

    if (hasMismatchingParams) {
      return `Function '${functionName}' exists but has the wrong number of parameters.\n\n` +
        `Expected Signature: ${functionSignature}\n` +
        `Arguments Provided: ${parsedArgs.length}\n\n` +
        `What to check:\n` +
        `• Verify the function signature in the contract code\n` +
        `• Ensure you're passing the correct number of arguments\n` +
        `• Arguments must be a JSON array: ["arg1", 123, true]`;
    }

    if (hasUnreachableCode) {
      return `Contract execution failed: function '${functionName}' panicked.\n\n` +
        `Common causes:\n` +
        `• Authorization check failed (caller not authorized)\n` +
        `• Contract assertion/requirement failed (panic! or require!)\n` +
        `• Invalid parameter values (e.g., out of range)\n` +
        `• Contract precondition not met (e.g., insufficient balance)\n` +
        `• Logic error causing unreachable code to execute\n\n` +
        `💡 The contract logic rejected the operation. Review the contract's requirements and arguments.`;
    }

    return errorMessage;
  };

  const handleSimulate = async () => {
    functionNameRef.current = functionName;
    setIsSimulating(true);
    setResult(null);

    try {
      // Validate inputs
      if (!contractId || !functionName || !sourceAccount) {
        throw new Error('Please fill in all required fields');
      }
      if (!selectedFunction) {
        throw new Error('Contract metadata not loaded or function not found. Please wait for metadata to load.');
      }

      // Parse arguments
      let parsedArgs: any[];
      try {
        parsedArgs = JSON.parse(args);
        if (!Array.isArray(parsedArgs)) {
          throw new Error('Arguments must be a JSON array');
        }
      } catch (e) {
        throw new Error('Invalid JSON format for arguments');
      }

      if (parsedArgs.length !== selectedFunction.inputs.length) {
        throw new Error(
          `Incorrect number of arguments. Function '${selectedFunction.name}' requires ${selectedFunction.inputs.length} argument(s), but ${parsedArgs.length} provided.`
        );
      }

      // Setup RPC and Horizon servers
      const rpcUrl = networkConfig.isTestnet
        ? 'https://soroban-testnet.stellar.org'
        : 'https://soroban-rpc.mainnet.stellar.gateway.fm';
      const rpcServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: false });
      const horizonServer = new StellarSdk.Horizon.Server(networkConfig.networkUrl, { allowHttp: false });

      // Load account
      let account;
      try {
        account = await horizonServer.loadAccount(sourceAccount);
      } catch (accountError: any) {
        if (accountError.response?.status === 404) {
          throw new Error(
            `Account not found: ${sourceAccount}\n\n` +
            `This account doesn't exist on ${networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}.\n\n` +
            `To use the simulator, you need a valid account address.`
          );
        }
        throw new Error(`Failed to load account: ${accountError.message || 'Unknown error'}`);
      }

      // Convert arguments to ScVals
      const scArgs = parsedArgs.map((arg, index) => {
        try {
          return convertArgToScVal(arg, index);
        } catch (conversionError: any) {
          throw new Error(
            `Argument ${index + 1} (${selectedFunction.inputs[index].name}:${selectedFunction.inputs[index].type}): ${conversionError.message}. Value: ${stringifyWithBigInt(arg)}`
          );
        }
      });

      // Build and simulate transaction
      const contract = new StellarSdk.Contract(contractId);
      const operation = contract.call(functionName, ...scArgs);
      let transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      let simulation;
      try {
        simulation = await rpcServer.simulateTransaction(transaction);
      } catch (rpcError: any) {
        if (rpcError.message?.includes('ERR_NAME_NOT_RESOLVED') ||
          rpcError.message?.includes('Network') ||
          rpcError.name === 'TypeError') {
          throw new Error(
            'Network error: Unable to connect to Soroban RPC server.\n\n' +
            'This may be due to:\n' +
            '• CORS restrictions in the browser environment\n' +
            '• Network connectivity issues\n' +
            '• RPC server temporarily unavailable\n\n' +
            'Try refreshing the page or checking your internet connection.'
          );
        }
        throw new Error(`RPC Error: ${rpcError.message || 'Unknown error'}`);
      }

      // Process simulation result
      const events = extractEvents(simulation);

      if (StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
        // Check for auth entries
        // Try standard paths for auth, and also the results array which is common in newer RPC versions
        let authEntries: any[] = [];

        if (Array.isArray(simulation.result?.auth)) {
          authEntries = simulation.result.auth;
        } else if (Array.isArray(simulation.auth)) {
          authEntries = simulation.auth;
        } else if (simulation.result?.results && Array.isArray(simulation.result.results)) {
          // Extract auth from all results
          authEntries = simulation.result.results.flatMap((r: any) => r.auth || []);
        }

        let authRequirements = undefined;

        if (authEntries.length > 0) {
          try {
            for (const authEntryRaw of authEntries) {
              let authEntry;

              // Handle both Base64 XDR strings and already-parsed XDR objects
              if (typeof authEntryRaw === 'string') {
                authEntry = StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(authEntryRaw, 'base64');
              } else {
                // Assume it is already an object (possibly an XDR instance or JSON)
                authEntry = authEntryRaw;
              }

              // Check if it has the helper method .credentials() (typical sdk XDR object)
              if (typeof authEntry.credentials !== 'function') {
                continue;
              }

              const credentials = authEntry.credentials();

              const credSwitch = credentials.switch();
              // Handle both object-with-name and direct enum checks if possible (safest to use name or catch)
              const switchName = typeof credSwitch === 'object' && credSwitch.name ? credSwitch.name : credSwitch.toString();

              // Check for Address credentials (which specify a specific address must sign)
              if (switchName === 'sorobanCredentialsAddress' || switchName === '1') { // 1 might be the int value for address
                const addressCred = credentials.address();
                const address = addressCred.address();
                const addrSwitch = address.switch();
                const addrSwitchName = typeof addrSwitch === 'object' && addrSwitch.name ? addrSwitch.name : addrSwitch.toString();

                let requiredAddress = '';
                if (addrSwitchName === 'scAddressTypeAccount' || addrSwitchName === '0') { // 0 for account
                  requiredAddress = StellarSdk.StrKey.encodeEd25519PublicKey(address.accountId().ed25519());
                }

                if (requiredAddress) {
                  const isMismatch = requiredAddress !== sourceAccount;
                  // We capture the requirement details to show in the UI, but we DO NOT fail the simulation.
                  // The user wants to see the simulation succeed but be informed of the signing requirement.
                  authRequirements = {
                    requiredAddress,
                    sourceAccount,
                    isMismatch,
                    allAuthEntries: authEntries
                  };
                  // If we found a specific address requirement, we can stop looking (usually the most important one)
                  if (isMismatch) break;
                }
              }
            }
          } catch (e: any) {
            console.warn('Error extracting authorization info:', e);
          }
        }

        try {
          transaction = StellarSdk.rpc.assembleTransaction(transaction, simulation).build();
        } catch (assembleError: any) {
          throw new Error(`Failed to assemble transaction: ${assembleError.message || 'Unknown error'}`);
        }

        // Extract result
        let decodedResult = null;
        if (simulation.result?.retval) {
          try {
            decodedResult = StellarSdk.scValToNative(simulation.result.retval);
          } catch (e) {
            decodedResult = 'Unable to decode result';
          }
        }

        const resourceUsage = extractResourceUsage(simulation);

        setResult({
          success: true,
          result: decodedResult,
          resourceUsage,
          cost: {
            totalFee: simulation.minResourceFee || '0',
            resourceFee: simulation.minResourceFee || '0',
          },
          events,
          authRequirements
        });
      } else {
        const errorMessage = generateErrorMessage(
          simulation.error || 'Simulation failed',
          events,
          functionNameRef.current,
          selectedFunction,
          parsedArgs
        );

        setResult({
          success: false,
          error: errorMessage,
          events,
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'An unexpected error occurred',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-1">Smart Contract Simulator</h3>
            <p className="text-sm text-blue-700 mb-2">
              Simulate smart contract invocations before executing them on the network.
              This helps estimate costs and test contract behavior without spending XLM.
            </p>
            <p className="text-xs text-blue-600 font-medium">
              Currently on: {networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-700 mb-2 text-sm">Quick Start Tips</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Use any valid funded account address for the Source Account field</li>
          <li>• The account won't be charged - simulation is free</li>
          <li>• Arguments must be provided as a JSON array: ["arg1", 123, true]</li>
          <li>• For large numbers (token amounts, i64, i128), use strings: ["GXXX...", "10000000000000"]</li>
          <li>• Switch networks using the selector at the top if your contract is on a different network</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contract ID <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              placeholder="CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm pr-10"
            />
            {isFetchingMetadata && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              </div>
            )}
          </div>
          {contractMetadata && (
            contractMetadata.functions && contractMetadata.functions.length > 0 ? (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                <p className="text-green-800 font-medium">
                  {contractMetadata.isToken ? (
                    <>
                      Token Contract: {contractMetadata.tokenSymbol || contractMetadata.tokenName || 'Unknown'}
                      {contractMetadata.tokenDecimals !== undefined && ` (${contractMetadata.tokenDecimals} decimals)`}
                    </>
                  ) : (
                    <>Smart Contract loaded</>
                  )}
                </p>
                <p className="text-green-700 text-xs mt-1">
                  {contractMetadata.functions.length} function{contractMetadata.functions.length > 1 ? 's' : ''} available
                </p>
              </div>
            ) : (
              <div className="mt-2 p-2 bg-orange-50 border border-orange-300 rounded text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-orange-900 font-medium">Could not load contract</p>
                    <p className="text-orange-800 text-xs mt-1">
                      The contract was not found on {networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}.
                      Please verify the Contract ID is correct and that the contract exists on the selected network.
                    </p>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Function Name <span className="text-red-500">*</span>
          </label>
          {contractMetadata?.functions && contractMetadata.functions.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFunctionDropdown(!showFunctionDropdown)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm text-left flex items-center justify-between bg-white hover:bg-gray-50"
              >
                <span className={functionName ? 'text-gray-900' : 'text-gray-400'}>
                  {functionName || 'Select a function'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showFunctionDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {contractMetadata.functions.map((func, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleFunctionSelect(func)}
                      className="w-full px-4 py-2 text-left hover:bg-blue-50 font-mono text-sm border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium text-gray-900">{func.name}</div>
                      {func.inputs.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          ({func.inputs.map(input => `${input.name}: ${input.type}`).join(', ')})
                        </div>
                      )}
                      {func.outputs && func.outputs.length > 0 && (
                        <div className="text-xs text-blue-600 mt-0.5">
                          → {func.outputs.map(out => out.type).join(', ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              placeholder="transfer"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          )}
          {selectedFunction && (
            <>
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                <p className="text-blue-900 font-medium mb-1">Function Signature:</p>
                <code className="text-blue-700 text-xs">
                  {selectedFunction.name}(
                  {selectedFunction.inputs.map(input => `${input.name}: ${input.type}`).join(', ')}
                  )
                  {selectedFunction.outputs && selectedFunction.outputs.length > 0 && (
                    <> → {selectedFunction.outputs.map(out => out.type).join(', ')}</>
                  )}
                </code>
              </div>
              {contractMetadata?.isToken && ['mint', 'burn', 'set_admin', 'clawback'].includes(selectedFunction.name.toLowerCase()) && (
                <div className="mt-2 p-3 bg-orange-50 border border-orange-300 rounded text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-orange-900 font-semibold mb-1">Admin Function Notice</p>
                      <p className="text-orange-800 text-xs">
                        This function requires admin/minter authorization.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Source Account <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={sourceAccount}
            onChange={(e) => setSourceAccount(e.target.value)}
            placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            The account that would invoke the contract (used for simulation only)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Arguments (JSON Array)
          </label>
          {selectedFunction && selectedFunction.inputs.length > 0 && (
            <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
              <p className="font-medium text-gray-700 mb-1">Expected parameters:</p>
              <ul className="space-y-0.5 text-gray-600">
                {selectedFunction.inputs.map((input, idx) => (
                  <li key={idx}>
                    {idx + 1}. <code className="text-blue-600">{input.name}</code>: <span className="text-gray-500">{input.type}</span>
                    {input.type.toLowerCase().includes('address') && ' (use Stellar address: GXXX... or CXXX...)'}
                    {(input.type.toLowerCase().includes('i128') || input.type.toLowerCase().includes('u128')) && ' (use string for number)'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder='["GXXX...", "10000000000"]'
            rows={selectedFunction && selectedFunction.inputs.length > 2 ? 6 : 4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            {selectedFunction ? (
              selectedFunction.inputs.length === 0 ? (
                'This function takes no arguments. Use an empty array: []'
              ) : (
                `Provide ${selectedFunction.inputs.length} argument${selectedFunction.inputs.length > 1 ? 's' : ''} as a JSON array in the order shown above.`
              )
            ) : (
              'Provide arguments as a JSON array. Use strings for addresses and large numbers (e.g., token amounts).'
            )}
          </p>
        </div>
      </div>

      <button
        onClick={handleSimulate}
        disabled={isSimulating || !contractId || !functionName || !sourceAccount}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
      >
        {isSimulating ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Simulating...
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Simulate Execution
          </>
        )}
      </button>

      {result && (
        <div className={`border rounded-lg p-6 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            {result.success ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-green-900">Simulation Successful</h3>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-red-900">Simulation Failed</h3>
              </>
            )}
          </div>

          {!result.success && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                <span className="font-medium">⚠️ Note:</span> This simulation shows what would happen if you execute this call with the current blockchain state.
              </p>
            </div>
          )}

          {result.success ? (
            <div className="space-y-4">
              {/* Auth Requirement Warning */}
              {result.authRequirements && result.authRequirements.isMismatch && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-900 font-medium">Authorization Required</p>
                      <p className="text-yellow-800 mt-1">
                        This transaction requires authorization from: <span className="font-mono font-bold">{result.authRequirements.requiredAddress}</span>
                      </p>
                      <p className="text-yellow-700 text-xs mt-1">
                        You are simulating as <span className="font-mono">{result.authRequirements.sourceAccount}</span>. In a real transaction, {result.authRequirements.requiredAddress} would need to sign this.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Return Value
                </h4>
                <pre className="bg-white border border-gray-200 rounded p-3 text-sm overflow-x-auto">
                  {stringifyWithBigInt(result.result, 2)}
                </pre>
              </div>

              {result.resourceUsage && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Resource Usage
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">CPU Instructions</p>
                      <p className="font-mono text-sm font-medium text-blue-600">
                        {result.resourceUsage.cpuInstructions.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Computational work</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Ledger I/O</p>
                      <p className="font-mono text-sm font-medium text-blue-600">
                        {result.resourceUsage.memoryBytes.toLocaleString()} bytes
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Storage read + write</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Ledger Reads</p>
                      <p className="font-mono text-sm font-medium text-green-600">
                        {result.resourceUsage.readLedgerEntries || 0} {result.resourceUsage.readLedgerEntries === 1 ? 'entry' : 'entries'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Entries accessed</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Ledger Writes</p>
                      <p className="font-mono text-sm font-medium text-orange-600">
                        {result.resourceUsage.writeLedgerEntries || 0} {result.resourceUsage.writeLedgerEntries === 1 ? 'entry' : 'entries'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Entries modified</p>
                    </div>
                  </div>
                  <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                    <p><strong>Note:</strong> Runtime memory usage (1-2 MB typically) is not shown in simulation but is metered during execution.</p>
                  </div>
                </div>
              )}

              {result.cost && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Estimated Cost
                  </h4>
                  <div className="bg-white border border-gray-200 rounded p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Minimum Resource Fee</span>
                        <span className="font-mono font-semibold text-lg text-green-700">
                          {(Number(result.cost.resourceFee) / 10_000_000).toFixed(7)} XLM
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">Stroops</span>
                        <span className="font-mono text-gray-600">
                          {Number(result.cost.resourceFee).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
                        <p className="text-xs text-yellow-800 font-semibold mb-1">
                          ⚠️ Important: Simulation fee is often 100-300x higher than actual cost
                        </p>
                        <p className="text-xs text-yellow-700">
                          This is the RPC server's conservative estimate. The actual fee will likely be much lower (typically 0.002-0.01 XLM for token operations) due to:
                        </p>
                        <ul className="text-xs text-yellow-700 mt-1 ml-4 list-disc space-y-0.5">
                          <li>Actual resource usage vs. reserved resources</li>
                          <li>Fee refunds for unused resources</li>
                          <li>Current network fee rates</li>
                        </ul>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="text-xs text-blue-700">
                          <strong>Expected actual cost:</strong> ~{(Number(result.cost.resourceFee) / 10_000_000 * 0.005).toFixed(7)} - {(Number(result.cost.resourceFee) / 10_000_000 * 0.02).toFixed(7)} XLM
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          Check the final fee on Stellar Expert after submitting the transaction.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {result.events && result.events.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Contract Events</h4>
                  <div className="space-y-2">
                    {result.events.map((event, idx) => (
                      <div key={idx} className="bg-white border border-gray-200 rounded p-3">
                        <p className="text-xs text-gray-500 mb-1">Event {idx + 1} ({event.type})</p>
                        <pre className="text-xs overflow-x-auto">
                          {stringifyWithBigInt(event, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-red-900 mb-2">Error Details</h4>
                <pre className="bg-white border border-red-200 rounded p-3 text-sm text-red-700 overflow-x-auto whitespace-pre-wrap">
                  {result.error}
                </pre>
              </div>

              {result.events && result.events.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Diagnostic Events
                  </h4>
                  <div className="space-y-2">
                    {result.events.map((event, idx) => (
                      <div key={idx} className="bg-white border border-red-200 rounded p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-700 rounded-full text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-gray-500 mb-1">[{event.type || 'diagnostic'}]</p>
                            {event.topics && event.topics.length > 0 && (
                              <div className="mb-1">
                                <p className="text-xs text-gray-600 font-medium">Topics:</p>
                                <pre className="text-xs text-gray-700 overflow-x-auto">
                                  {stringifyWithBigInt(event.topics, 2)}
                                </pre>
                              </div>
                            )}
                            {event.data !== null && event.data !== undefined && (
                              <div>
                                <p className="text-xs text-gray-600 font-medium">Data:</p>
                                <pre className="text-xs text-red-600 overflow-x-auto font-semibold">
                                  {typeof event.data === 'string' ? event.data : stringifyWithBigInt(event.data, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {contractMetadata?.isToken && ['mint', 'burn', 'set_admin', 'clawback'].includes(functionName.toLowerCase()) && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-yellow-900 mb-2">Token Admin Function</h4>
                      <p className="text-sm text-yellow-800 mb-2">
                        The function <code className="bg-yellow-100 px-1 py-0.5 rounded">{functionName}</code> requires admin/minter authorization.
                      </p>
                      <p className="text-sm text-yellow-800">
                        <strong>Why this failed:</strong> The source account doesn't have the required privileges.
                      </p>
                      <p className="text-sm text-yellow-800 mt-2">
                        <strong>To fix:</strong>
                      </p>
                      <ul className="text-sm text-yellow-800 list-disc list-inside mt-1 space-y-1">
                        <li>Use the actual admin account address as the Source Account</li>
                        <li>Or try non-admin functions like: <code className="bg-yellow-100 px-1 py-0.5 rounded">balance</code>, <code className="bg-yellow-100 px-1 py-0.5 rounded">symbol</code></li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
