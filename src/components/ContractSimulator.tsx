import React, { useState, useRef } from 'react';
import { Play, AlertCircle, CheckCircle, Loader, Code, Cpu, Database } from 'lucide-react';
import * as StellarSdk from '@stellar/stellar-sdk';
import type { NetworkConfig } from '../types/stellar';

// Helper function to serialize objects with BigInt values
function stringifyWithBigInt(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
    space
  );
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
    readLedgerEntries?: number;
    writeLedgerEntries?: number;
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
}

export function ContractSimulator({ networkConfig }: ContractSimulatorProps) {
  const [contractId, setContractId] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [args, setArgs] = useState('[]');
  const [sourceAccount, setSourceAccount] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const functionNameRef = useRef('');

  const handleSimulate = async () => {
    functionNameRef.current = functionName;
    setIsSimulating(true);
    setResult(null);

    try {
      // Validate inputs
      if (!contractId || !functionName || !sourceAccount) {
        throw new Error('Please fill in all required fields');
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

      // Build the contract invocation
      // Using public RPC endpoints with CORS support
      const rpcUrl = networkConfig.isTestnet
        ? 'https://soroban-testnet.stellar.org'
        : 'https://mainnet.sorobanrpc.com';

      const rpcServer = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: false });

      // Load source account from Horizon (more reliable than Soroban RPC for all accounts)
      const horizonUrl = networkConfig.networkUrl;
      const horizonServer = new StellarSdk.Horizon.Server(horizonUrl, { allowHttp: false });

      let account;
      try {
        account = await horizonServer.loadAccount(sourceAccount);
      } catch (accountError: any) {
        if (accountError.response?.status === 404) {
          throw new Error(
            `Account not found: ${sourceAccount}\n\n` +
            `This account doesn't exist on ${networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}.\n\n` +
            `To use the simulator, you need a valid account address. You can:\n` +
            `1. Use an existing funded account address\n` +
            `2. Create a new account on ${networkConfig.isTestnet ? 'Testnet' : 'Mainnet'}\n` +
            `3. Switch networks using the network selector above`
          );
        }
        throw new Error(`Failed to load account: ${accountError.message || 'Unknown error'}`);
      }

      // Convert arguments to ScVals with intelligent type detection
      const scArgs = parsedArgs.map((arg, index) => {
        try {
          if (typeof arg === 'string') {
            // Check if it's a Stellar address (account or contract)
            if (arg.match(/^G[A-Z0-9]{55}$/)) {
              // Stellar account address (public key)
              return StellarSdk.Address.fromString(arg).toScVal();
            } else if (arg.match(/^C[A-Z0-9]{55}$/)) {
              // Stellar contract address
              return StellarSdk.Address.fromString(arg).toScVal();
            } else if (arg.match(/^-?\d+$/)) {
              // String containing only digits (large number as string)
              const bigNum = BigInt(arg);

              // Determine the appropriate type based on value and range
              if (bigNum >= 0n) {
                if (bigNum <= 4294967295n) {
                  return StellarSdk.nativeToScVal(Number(bigNum), { type: 'u32' });
                } else if (bigNum <= 18446744073709551615n) {
                  return StellarSdk.nativeToScVal(bigNum, { type: 'u64' });
                } else {
                  // Very large positive number, use i128
                  return StellarSdk.nativeToScVal(bigNum, { type: 'i128' });
                }
              } else {
                if (bigNum >= -2147483648n && bigNum <= 2147483647n) {
                  return StellarSdk.nativeToScVal(Number(bigNum), { type: 'i32' });
                } else if (bigNum >= -9223372036854775808n) {
                  return StellarSdk.nativeToScVal(bigNum, { type: 'i64' });
                } else {
                  return StellarSdk.nativeToScVal(bigNum, { type: 'i128' });
                }
              }
            } else {
              // Regular string
              return StellarSdk.nativeToScVal(arg);
            }
          } else if (typeof arg === 'number') {
            // For numbers, try to determine the best type
            if (Number.isInteger(arg)) {
              if (arg >= 0 && arg <= 4294967295) {
                // Fits in u32
                return StellarSdk.nativeToScVal(arg, { type: 'u32' });
              } else if (arg >= 0 && arg <= Number.MAX_SAFE_INTEGER) {
                // Positive, use i128 for better compatibility with token amounts
                const scVal = StellarSdk.nativeToScVal(BigInt(arg), { type: 'i128' });
                return scVal;
              } else if (arg < 0 && arg >= -Number.MAX_SAFE_INTEGER) {
                // Negative, use i128
                return StellarSdk.nativeToScVal(BigInt(arg), { type: 'i128' });
              } else {
                return StellarSdk.nativeToScVal(BigInt(Math.floor(arg)), { type: 'i128' });
              }
            } else {
              // Floating point - try as string or error
              return StellarSdk.nativeToScVal(arg.toString());
            }
          } else if (typeof arg === 'boolean') {
            return StellarSdk.nativeToScVal(arg);
          } else if (Array.isArray(arg)) {
            // Handle arrays recursively
            return StellarSdk.nativeToScVal(arg);
          } else if (arg === null || arg === undefined) {
            // Handle null/undefined as Option::None or Void
            return StellarSdk.xdr.ScVal.scvVoid();
          } else {
            // Try nativeToScVal for objects
            return StellarSdk.nativeToScVal(arg);
          }
        } catch (conversionError: any) {
          throw new Error(`Failed to convert argument ${index + 1}: ${conversionError.message}. Value: ${stringifyWithBigInt(arg)}`);
        }
      });

      // Build contract invocation operation
      const contract = new StellarSdk.Contract(contractId);
      const operation = contract.call(functionName, ...scArgs);

      // Build transaction
      let transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      // Simulate transaction to get auth and resource requirements
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

      if (StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
        // Log the entire simulation response to understand its structure

        // Extract result
        const resultValue = simulation.result?.retval;
        let decodedResult = null;

        if (resultValue) {
          try {
            decodedResult = StellarSdk.scValToNative(resultValue);
          } catch (e) {
            decodedResult = 'Unable to decode result';
          }
        }

        // Extract resource usage from simulation cost
        let cpuInstructions = 0;
        let memoryBytes = 0;
        let ledgerReadBytes = 0;
        let ledgerWriteBytes = 0;
        let readLedgerEntries = 0;
        let writeLedgerEntries = 0;

        // Log the entire simulation structure

        // Extract from simulation.cost if available
        if (simulation.cost) {
          try {
            const cost = simulation.cost as any;

            // CPU instructions
            if (cost.cpuInsns !== undefined) {
              cpuInstructions = Number(cost.cpuInsns);
            }

            // Memory bytes
            if (cost.memBytes !== undefined) {
              memoryBytes = Number(cost.memBytes);
            }
          } catch (e: any) {
          }
        }

        // Try extracting from latestLedger if cost doesn't have the info
        if (cpuInstructions === 0 && simulation.latestLedger) {
        }

        // Try extracting from transactionData (SorobanDataBuilder)
        if (simulation.transactionData) {
          try {
            const txData = simulation.transactionData as any;

            // Check if it has getResourceFee or resources method
            if (typeof txData.getResourceFee === 'function') {
            }

            // Try to access internal data structure
            if (txData._data) {
              const data = txData._data;

              if (data.resources) {
                const resources = typeof data.resources === 'function' ? data.resources() : data.resources;

                // Extract instructions
                if (resources.instructions) {
                  const instructions = typeof resources.instructions === 'function' ? resources.instructions() : resources.instructions;
                  if (cpuInstructions === 0) {
                    cpuInstructions = Number(instructions);
                  }
                }

                // Extract read bytes
                if (resources.readBytes) {
                  const readBytes = typeof resources.readBytes === 'function' ? resources.readBytes() : resources.readBytes;
                  ledgerReadBytes = Number(readBytes);
                }

                // Extract write bytes
                if (resources.writeBytes) {
                  const writeBytes = typeof resources.writeBytes === 'function' ? resources.writeBytes() : resources.writeBytes;
                  ledgerWriteBytes = Number(writeBytes);
                }

                // Extract read ledger entries
                if (resources.readLedgerEntries) {
                  const readEntries = typeof resources.readLedgerEntries === 'function' ? resources.readLedgerEntries() : resources.readLedgerEntries;
                  readLedgerEntries = Number(readEntries);
                }

                // Extract write ledger entries
                if (resources.writeLedgerEntries) {
                  const writeEntries = typeof resources.writeLedgerEntries === 'function' ? resources.writeLedgerEntries() : resources.writeLedgerEntries;
                  writeLedgerEntries = Number(writeEntries);
                }

                // If memoryBytes wasn't in cost, calculate from read+write
                if (memoryBytes === 0) {
                  memoryBytes = ledgerReadBytes + ledgerWriteBytes;
                }
              }
            }

            // Also try direct access to resources (newer SDK versions)
            if (typeof txData.resources === 'function') {
              const resources = txData.resources();

              if (resources.readLedgerEntries && typeof resources.readLedgerEntries === 'function') {
                readLedgerEntries = Number(resources.readLedgerEntries());
              }

              if (resources.writeLedgerEntries && typeof resources.writeLedgerEntries === 'function') {
                writeLedgerEntries = Number(resources.writeLedgerEntries());
              }

              if (resources.readBytes && typeof resources.readBytes === 'function') {
                ledgerReadBytes = Number(resources.readBytes());
              }

              if (resources.writeBytes && typeof resources.writeBytes === 'function') {
                ledgerWriteBytes = Number(resources.writeBytes());
              }
            }
          } catch (e: any) {
          }
        }

        // Extract ledger entry counts from transactionData for final result
        if (simulation.transactionData) {
          try {
            const txData = simulation.transactionData as any;

            // Try to access resources object
            if (txData._attributes) {
              const resources = txData._attributes.resources || txData._attributes.ext?.sorobanTransactionData?.resources;

              if (resources) {

                // Try accessing footprint for ledger entries
                if (resources.footprint) {
                  if (resources.footprint.readOnly) {
                    const readOnly = Array.isArray(resources.footprint.readOnly) ? resources.footprint.readOnly : [];
                    readLedgerEntries = readOnly.length;
                  }
                  if (resources.footprint.readWrite) {
                    const readWrite = Array.isArray(resources.footprint.readWrite) ? resources.footprint.readWrite : [];
                    writeLedgerEntries = readWrite.length;
                  }
                }
              }
            }

            // Try multiple access paths - check _data first
            if (txData._data) {

              if (typeof txData._data.resources === 'function') {
                const resources = txData._data.resources();

                if (typeof resources.readLedgerEntries === 'function') {
                  readLedgerEntries = Number(resources.readLedgerEntries());
                }
                if (typeof resources.writeLedgerEntries === 'function') {
                  writeLedgerEntries = Number(resources.writeLedgerEntries());
                }

                // If not found, try footprint
                if ((readLedgerEntries === 0 || writeLedgerEntries === 0) && typeof resources.footprint === 'function') {
                  try {
                    const footprint = resources.footprint();
                    const readOnly = typeof footprint.readOnly === 'function' ? footprint.readOnly() : [];
                    const readWrite = typeof footprint.readWrite === 'function' ? footprint.readWrite() : [];

                    if (readLedgerEntries === 0) {
                      readLedgerEntries = readOnly.length + readWrite.length;
                    }
                    if (writeLedgerEntries === 0) {
                      writeLedgerEntries = readWrite.length;
                    }
                  } catch (e) {
                  }
                }
              }
            }

            // Direct access fallback - using the same pattern as stellar.ts
            if (typeof txData.resources === 'function') {
              const resources = txData.resources();

              if (resources.readLedgerEntries && typeof resources.readLedgerEntries === 'function') {
                readLedgerEntries = Number(resources.readLedgerEntries());
              } else {
              }

              if (resources.writeLedgerEntries && typeof resources.writeLedgerEntries === 'function') {
                writeLedgerEntries = Number(resources.writeLedgerEntries());
              } else {
              }

              // If not found directly, try footprint
              if ((readLedgerEntries === 0 || writeLedgerEntries === 0) && typeof resources.footprint === 'function') {
                try {
                  const footprint = resources.footprint();

                  const readOnly = footprint.readOnly ? footprint.readOnly() : [];
                  const readWrite = footprint.readWrite ? footprint.readWrite() : [];

                  if (readLedgerEntries === 0) {
                    readLedgerEntries = readOnly.length + readWrite.length;
                  }

                  if (writeLedgerEntries === 0) {
                    writeLedgerEntries = readWrite.length;
                  }
                } catch (footprintError: any) {
                }
              } else {
              }
            } else {
            }
          } catch (e) {
          }
        }

        // Extract events - handle the actual SDK structure
        const events = simulation.events?.map((eventWrapper: any, idx: number) => {
          try {
            let decodedTopics: any[] = [];
            let decodedData: any = null;
            let eventType = 'contract';

            // The actual event is in _attributes.event
            const event = eventWrapper._attributes?.event || eventWrapper.event || eventWrapper;

            // XDR objects have getter functions, so we need to call them
            // event.body is a getter function that returns the body object
            if (event.body && typeof event.body === 'function') {
              // Call the body() getter to get the actual body object
              const bodyObj = event.body();

              // Now check if bodyObj has v0() method or _value._attributes
              let v0Data = null;

              // Try to get v0 data from various possible locations
              if (bodyObj && bodyObj._value && bodyObj._value._attributes) {
                v0Data = bodyObj._value._attributes;
              } else if (bodyObj && bodyObj._attributes) {
                v0Data = bodyObj._attributes;
              } else if (bodyObj && typeof bodyObj.v0 === 'function') {
                const v0Result = bodyObj.v0();
                if (v0Result && v0Result._attributes) {
                  v0Data = v0Result._attributes;
                }
              }

              if (v0Data) {
                // Access topics and data directly from _attributes
                const topics = v0Data.topics;
                const data = v0Data.data;

                // Decode topics
                if (topics && Array.isArray(topics)) {
                  decodedTopics = topics.map((t: any) => {
                    try {
                      return StellarSdk.scValToNative(t);
                    } catch (e) {
                      return null;
                    }
                  }).filter((t: any) => t !== null);
                }

                // Decode data
                if (data) {
                  try {
                    decodedData = StellarSdk.scValToNative(data);
                  } catch (e) {
                  }
                }
              }
            }

            // Get event type if available
            if (event.type) {
              eventType = event.type;
            } else if (event._attributes?.inSuccessfulContractCall !== undefined) {
              eventType = event._attributes.inSuccessfulContractCall ? 'contract' : 'diagnostic';
            }

            return {
              type: eventType,
              topics: decodedTopics,
              data: decodedData,
            };
          } catch (e) {
            return {
              type: 'contract',
              topics: [],
              data: null
            };
          }
        }) || [];

        setResult({
          success: true,
          result: decodedResult,
          resourceUsage: {
            cpuInstructions,
            memoryBytes,
            ledgerReadBytes,
            ledgerWriteBytes,
            readLedgerEntries,
            writeLedgerEntries,
          },
          cost: {
            totalFee: simulation.minResourceFee || '0',
            resourceFee: simulation.minResourceFee || '0',
          },
          events,
        });
      } else {
        // Handle simulation error
        const error = simulation.error || 'Simulation failed';
        const events = simulation.events?.map((event: any) => {
          try {
            return {
              type: event.type || 'diagnostic',
              topics: event.topics?.map((t: any) => {
                try {
                  return StellarSdk.scValToNative(t);
                } catch {
                  return t;
                }
              }) || [],
              data: event.body ? StellarSdk.scValToNative(event.body.value()) : null,
            };
          } catch {
            return event;
          }
        }) || [];

        // Check for common error patterns and provide helpful messages
        let errorMessage = typeof error === 'string' ? error : stringifyWithBigInt(error, 2);
        const hasNonExistentFunction = events.some((e: any) =>
          e.data && typeof e.data === 'string' && e.data.includes('non-existent contract function')
        );
        const hasMismatchingParams = events.some((e: any) =>
          e.data && typeof e.data === 'string' && e.data.includes('MismatchingParameterLen')
        );
        const hasUnreachableCode = events.some((e: any) =>
          e.data && typeof e.data === 'string' && e.data.includes('UnreachableCodeReached')
        );
        const hasWasmVmError = events.some((e: any) =>
          (e.data && typeof e.data === 'string' && e.data.includes('WasmVm')) ||
          (e.topics && e.topics.some((t: any) => typeof t === 'string' && t.includes('WasmVm')))
        );
        const hasInvalidAction = events.some((e: any) =>
          (e.data && typeof e.data === 'string' && e.data.includes('InvalidAction')) ||
          (e.topics && e.topics.some((t: any) => typeof t === 'string' && t.includes('InvalidAction')))
        );

        if (hasNonExistentFunction) {
          const functionName = functionNameRef.current;
          errorMessage = `Function '${functionName}' does not exist on this contract.\n\n` +
            `Possible reasons:\n` +
            `• The function name is misspelled\n` +
            `• The contract doesn't implement this function\n` +
            `• You're using the wrong contract address\n\n` +
            `Check the contract's documentation or source code for available functions.`;
        } else if (hasMismatchingParams) {
          const functionName = functionNameRef.current;
          errorMessage = `Function '${functionName}' exists but has the wrong number of parameters.\n\n` +
            `What to check:\n` +
            `• Verify the function signature in the contract code\n` +
            `• Ensure you're passing the correct number of arguments\n` +
            `• Check that arguments are in the correct order\n` +
            `• Arguments must be a JSON array: ["arg1", 123, true]\n\n` +
            `Example: If function expects (address, amount), pass ["GXXX...", "1000000"]`;
        } else if (hasUnreachableCode || (hasWasmVmError && hasInvalidAction)) {
          const functionName = functionNameRef.current;
          errorMessage = `Contract execution failed: function '${functionName}' panicked.\n\n` +
            `Common causes:\n` +
            `• Authorization check failed (caller not authorized)\n` +
            `• Contract assertion/requirement failed (panic! or require!)\n` +
            `• Invalid parameter values (wrong types or out of range)\n` +
            `• Contract precondition not met (e.g., insufficient balance)\n` +
            `• Logic error causing unreachable code to execute\n\n` +
            `💡 This is a simulation showing what would happen if you execute this transaction.\n` +
            `The contract logic rejected the operation. Review the contract's requirements,\n` +
            `check the function arguments, and ensure your account has the necessary permissions.`;
        }

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
          <li>• For large numbers (token amounts), use strings: ["GXXX...", "10000000000000"]</li>
          <li>• Switch networks using the selector at the top if your contract is on a different network</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Contract ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            placeholder="CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Function Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            placeholder="transfer"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
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
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder='["GXXX...", "10000000000"]'
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Provide arguments as a JSON array. Use strings for addresses and large numbers (e.g., token amounts).
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
                <h3 className="font-semibold text-red-900">Simulation Shows Potential Failure</h3>
              </>
            )}
          </div>

          {!result.success && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                <span className="font-medium">⚠️ Important:</span> This is a <strong>re-simulation</strong> of the contract call with current blockchain state.
                The actual on-chain transaction may have succeeded with different state/parameters.
                This simulation shows what would happen if you execute this exact call right now.
              </p>
            </div>
          )}

          {result.success ? (
            <div className="space-y-4">
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
                      <p className="text-xs text-gray-400 mt-1">
                        Computational work performed
                      </p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Total Memory</p>
                      <p className="font-mono text-sm font-medium text-blue-600">
                        {result.resourceUsage.memoryBytes.toLocaleString()} bytes
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Combined read + write
                      </p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Ledger Read</p>
                      <p className="font-mono text-sm font-medium text-green-600">
                        {result.resourceUsage.readLedgerEntries || 0} {result.resourceUsage.readLedgerEntries === 1 ? 'entry' : 'entries'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {result.resourceUsage.ledgerReadBytes.toLocaleString()} bytes read
                      </p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Ledger Write</p>
                      <p className="font-mono text-sm font-medium text-orange-600">
                        {result.resourceUsage.writeLedgerEntries || 0} {result.resourceUsage.writeLedgerEntries === 1 ? 'entry' : 'entries'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {result.resourceUsage.ledgerWriteBytes.toLocaleString()} bytes written
                      </p>
                    </div>
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
                        <span className="text-sm text-gray-600">Resource Fee</span>
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
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <p className="text-xs text-blue-700">
                          This is the minimum fee required to execute this contract. The actual fee may be higher depending on network conditions.
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
                        <p className="text-xs text-gray-500 mb-1">Event {idx + 1}</p>
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
            <div>
              <h4 className="font-medium text-red-900 mb-2">Error Details</h4>
              <pre className="bg-white border border-red-200 rounded p-3 text-sm text-red-700 overflow-x-auto whitespace-pre-wrap">
                {result.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
