import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  NodeTypes,
  Connection,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Handle, Position } from 'reactflow';
import * as StellarSdk from '@stellar/stellar-sdk';

interface UserOperationFlowProps {
  events: any[];
  sourceAccount?: string;
  functionName?: string;
  assetBalanceChanges?: any[];
}

const decodeContractId = (value: any): string => {
  if (!value) return 'unknown';

  if (typeof value === 'string' && (value.startsWith('C') || value.startsWith('G')) && value.length === 56) {
    return value;
  }

  if (typeof value === 'string' && value.includes('=')) {
    try {
      const binaryString = atob(value);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (bytes.length === 32) {
        try {
          return StellarSdk.StrKey.encodeContract(bytes);
        } catch {
          try {
            return StellarSdk.StrKey.encodeEd25519PublicKey(bytes);
          } catch {
            return value;
          }
        }
      }
    } catch (e) {
    }
  }

  return String(value);
};

const formatValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  if (Array.isArray(val)) return val.map(formatValue).filter(Boolean).join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

const formatAddress = (address: string): string => {
  if (!address || address.length < 12) return address;
  return `${address.substring(0, 4)}…${address.substring(address.length - 4)}`;
};

const formatAmount = (amount: string): { raw: string; formatted: string } => {
  if (!amount) return { raw: '0', formatted: '0' };
  const decimals = 7;
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return {
    raw: amount,
    formatted: num.toFixed(decimals).replace(/\.?0+$/, '')
  };
};

interface OperationNodeData {
  stepNumber: string;
  emoji: string;
  title: string;
  content: string[];
  isPhaseHeader?: boolean;
  phaseTitle?: string;
  phaseEmoji?: string;
  phaseDescription?: string;
  isCompactGroup?: boolean;
  groupCount?: number;
}

const OperationNodeComponent = ({ data }: { data: OperationNodeData }) => {
  if (data.isPhaseHeader) {
    return (
      <div className="px-6 py-4 shadow-xl rounded-xl border-2 border-gray-400 bg-gradient-to-r from-slate-100 to-slate-200 min-w-[450px] max-w-[550px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-center gap-3">
          <span className="text-3xl">{data.phaseEmoji}</span>
          <div className="font-bold text-lg text-gray-800">{data.phaseTitle}</div>
        </div>

        {data.phaseDescription && (
          <div className="text-sm text-gray-600 italic mt-2 ml-11">
            {data.phaseDescription}
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  if (data.isCompactGroup) {
    return (
      <div className="px-4 py-3 shadow-md rounded-lg border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white min-w-[300px] max-w-[350px]">
        <Handle type="target" position={Position.Top} className="w-3 h-3" />

        <div className="flex items-start gap-2">
          <span className="text-xl flex-shrink-0">{data.emoji}</span>
          <div className="flex-1">
            <div className="font-semibold text-sm text-gray-900 mb-2">{data.title}</div>

            {data.content.length > 0 && (
              <div className="space-y-1.5">
                {data.content.map((line, idx) => (
                  <div key={idx} className="text-xs text-gray-700 leading-relaxed bg-white/80 px-2 py-1 rounded border border-gray-100">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      </div>
    );
  }

  // Determine node styling based on emoji/type
  const isVerificationNode = data.emoji === '✅';
  const isCalculationNode = data.emoji === '🧮';
  const isMintNode = data.emoji === '🪙';
  const isBroadcastNode = data.emoji === '📡';
  const isTransferNode = data.emoji === '💰';

  let borderColor = 'border-blue-200';
  let bgGradient = 'bg-white';
  let titleColor = 'text-gray-800';

  if (isVerificationNode) {
    borderColor = 'border-green-300';
    bgGradient = 'bg-gradient-to-br from-green-50 to-white';
    titleColor = 'text-green-800';
  } else if (isCalculationNode) {
    borderColor = 'border-blue-300';
    bgGradient = 'bg-gradient-to-br from-blue-50 to-white';
    titleColor = 'text-blue-800';
  } else if (isMintNode) {
    borderColor = 'border-amber-300';
    bgGradient = 'bg-gradient-to-br from-amber-50 to-white';
    titleColor = 'text-amber-800';
  } else if (isBroadcastNode) {
    borderColor = 'border-purple-300';
    bgGradient = 'bg-gradient-to-br from-purple-50 to-white';
    titleColor = 'text-purple-800';
  } else if (isTransferNode) {
    borderColor = 'border-emerald-300';
    bgGradient = 'bg-gradient-to-br from-emerald-50 to-white';
    titleColor = 'text-emerald-800';
  }

  return (
    <div className={`px-5 py-4 shadow-lg rounded-xl border-2 ${borderColor} ${bgGradient} hover:shadow-2xl transition-all duration-200 min-w-[420px] max-w-[520px]`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{data.emoji}</span>
        <div className="flex-1">
          <div className={`font-bold text-base ${titleColor} mb-2`}>{data.title}</div>

          {data.content.length > 0 && (
            <div className="space-y-1.5">
              {data.content.map((line, idx) => (
                <div key={idx} className="text-sm text-gray-700 leading-relaxed bg-white/50 px-3 py-1.5 rounded-md">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  operation: OperationNodeComponent,
};

function UserOperationFlowInner({ events, sourceAccount, functionName, assetBalanceChanges = [] }: UserOperationFlowProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);

  useEffect(() => {
    const generatedNodes: Node[] = [];
    const generatedEdges: Edge[] = [];
    let yOffset = 0;
    const ySpacing = 220;
    const xCenter = 700;
    const horizontalSpacing = 360;

    // Group similar operations
    interface GroupedOperation {
      type: string;
      operations: any[];
      functionName: string;
    }

    const seenCalls = new Set<string>();
    const filteredEvents = events.filter((event: any) => {
      const topics = event.topics || [];
      if (topics.length === 0) return true;
      const eventType = topics[0];

      if (eventType === 'core_metrics') return false;

      if (eventType === 'fn_call') {
        const contractId = event.contractId || '';
        const functionName = topics[2] || '';
        const key = `${contractId}:${functionName}`;
        seenCalls.add(key);
        return true;
      }

      if (eventType === 'mint' || eventType === 'transfer') {
        const contractId = event.contractId || '';
        const key = `${contractId}:${eventType}`;
        if (seenCalls.has(key)) {
          return false;
        }
      }

      return true;
    });

    let lastNodeId = '';
    let lastNodeIds: string[] = [];

    // Add initial user action node
    const firstCallEvent = filteredEvents.find((e: any) => {
      const topics = e.topics || [];
      return topics[0] === 'fn_call';
    });

    if (firstCallEvent) {
      const topics = firstCallEvent.topics || [];
      const data = firstCallEvent.data || [];
      const extractedFunctionName = topics[2] || 'transaction';
      const callerAddress = sourceAccount || 'unknown';

      const nodeId = 'user-action';
      generatedNodes.push({
        id: nodeId,
        type: 'operation',
        position: { x: xCenter, y: yOffset },
        data: {
          stepNumber: '🌾',
          emoji: '🌾',
          title: `${extractedFunctionName.charAt(0).toUpperCase() + extractedFunctionName.slice(1)} request started`,
          content: [`Account ${formatAddress(callerAddress)} initiated transaction`],
        },
      });

      lastNodeId = nodeId;
      lastNodeIds = [nodeId];
      yOffset += ySpacing;
    }

    // Group operations by function name
    const fnCallEvents = filteredEvents.filter((e: any) => e.topics?.[0] === 'fn_call');
    const operationGroups = new Map<string, any[]>();

    fnCallEvents.forEach((event: any) => {
      const fnName = event.topics?.[2] || 'unknown';
      if (!operationGroups.has(fnName)) {
        operationGroups.set(fnName, []);
      }
      operationGroups.get(fnName)!.push(event);
    });

    // Process each group
    operationGroups.forEach((ops, fnName) => {
      if (fnName.includes('harvest') || fnName.includes('claim')) {
        // Show harvest operations horizontally
        const rowNodeIds: string[] = [];
        const totalOps = ops.length;
        const opsToShow = Math.min(totalOps, 8); // Show max 8 in a row

        // Add phase header
        const phaseNodeId = 'phase-harvest';
        generatedNodes.push({
          id: phaseNodeId,
          type: 'operation',
          position: { x: xCenter, y: yOffset },
          data: {
            stepNumber: '',
            emoji: '',
            title: '',
            content: [],
            isPhaseHeader: true,
            phaseEmoji: '🔍',
            phaseTitle: 'HARVEST PHASE',
            phaseDescription: `${totalOps} parallel harvest operations`,
          },
        });

        lastNodeIds.forEach(prevId => {
          generatedEdges.push({
            id: `${prevId}-${phaseNodeId}`,
            source: prevId,
            target: phaseNodeId,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#64748b', strokeWidth: 2 },
          });
        });

        yOffset += 180;

        // Calculate horizontal positioning
        const totalWidth = opsToShow * horizontalSpacing;
        const startX = xCenter - totalWidth / 2 + horizontalSpacing / 2;

        ops.slice(0, opsToShow).forEach((op, idx) => {
          const xPos = startX + idx * horizontalSpacing;
          const nodeId = `harvest-${idx}`;
          const args = Array.isArray(op.data) ? op.data : [];
          const topics = op.topics || [];

          // Extract data
          const targetContractRaw = topics[1];
          const targetContract = decodeContractId(targetContractRaw);
          const contractShort = targetContract && targetContract.length > 12
            ? formatAddress(targetContract)
            : targetContract;

          const farmerArg = args[0] ? formatValue(args[0]) : '';
          const farmerShort = farmerArg && farmerArg.length > 12 ? formatAddress(farmerArg) : farmerArg;

          const pailArg = args[1] ? formatValue(args[1]) : `${idx + 1}`;
          const outputArg = args.length > 2 ? formatValue(args[args.length - 1]) : '';

          const content: string[] = [];
          if (contractShort) content.push(`Contract: ${contractShort}`);
          if (farmerShort) content.push(`Farmer: ${farmerShort}`);
          content.push(`Pail: ${pailArg.replace(/,/g, '')}`);
          if (outputArg) content.push(`Reward: ${outputArg.replace(/,/g, '')} units`);

          generatedNodes.push({
            id: nodeId,
            type: 'operation',
            position: { x: xPos, y: yOffset },
            data: {
              stepNumber: '🧮',
              emoji: '🧮',
              title: `Harvest #${idx + 1}`,
              content,
              isCompactGroup: true,
            },
          });

          generatedEdges.push({
            id: `${phaseNodeId}-${nodeId}`,
            source: phaseNodeId,
            target: nodeId,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          });

          rowNodeIds.push(nodeId);
        });

        lastNodeIds = rowNodeIds;
        yOffset += ySpacing;
      }
    });

    // Process mint events horizontally
    const mintEvents = assetBalanceChanges?.filter(c => c.type === 'mint') || [];
    if (mintEvents.length > 0) {
      const phaseNodeId = 'phase-mint';
      generatedNodes.push({
        id: phaseNodeId,
        type: 'operation',
        position: { x: xCenter, y: yOffset },
        data: {
          stepNumber: '',
          emoji: '',
          title: '',
          content: [],
          isPhaseHeader: true,
          phaseEmoji: '🪙',
          phaseTitle: 'TOKEN MINTING PHASE',
          phaseDescription: `${mintEvents.length} tokens minted`,
        },
      });

      lastNodeIds.forEach(prevId => {
        generatedEdges.push({
          id: `${prevId}-${phaseNodeId}`,
          source: prevId,
          target: phaseNodeId,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#64748b', strokeWidth: 2 },
        });
      });

      yOffset += 180;

      const rowNodeIds: string[] = [];
      const opsToShow = Math.min(mintEvents.length, 8);
      const totalWidth = opsToShow * horizontalSpacing;
      const startX = xCenter - totalWidth / 2 + horizontalSpacing / 2;

      mintEvents.slice(0, opsToShow).forEach((mint, idx) => {
        const xPos = startX + idx * horizontalSpacing;
        const nodeId = `mint-${idx}`;

        // Handle amount - it might be a string or number, and might already be formatted
        let displayAmount = '0';
        if (mint.amount) {
          const amountStr = String(mint.amount);
          // Check if it's already a decimal formatted string (contains a dot)
          if (amountStr.includes('.')) {
            displayAmount = amountStr;
          } else if (!isNaN(Number(amountStr))) {
            // It's a raw amount that needs formatting
            const formatted = formatAmount(amountStr);
            displayAmount = formatted.formatted;
          } else {
            displayAmount = amountStr;
          }
        }

        const tokenCode = mint.asset_code || 'Token';
        const recipient = mint.to ? formatAddress(mint.to) : 'wallet';
        const issuer = mint.asset_issuer ? formatAddress(mint.asset_issuer) : '';

        const content: string[] = [];
        content.push(`Amount: ${displayAmount} ${tokenCode}`);
        content.push(`To: ${recipient}`);
        if (issuer) content.push(`Issuer: ${issuer}`);

        generatedNodes.push({
          id: nodeId,
          type: 'operation',
          position: { x: xPos, y: yOffset },
          data: {
            stepNumber: '🪙',
            emoji: '🪙',
            title: `Mint #${idx + 1}`,
            content,
            isCompactGroup: true,
          },
        });

        generatedEdges.push({
          id: `${phaseNodeId}-${nodeId}`,
          source: phaseNodeId,
          target: nodeId,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#f59e0b', strokeWidth: 2 },
        });

        rowNodeIds.push(nodeId);
      });

      lastNodeIds = rowNodeIds;
      yOffset += ySpacing;
    }

    // Final credit node
    const creditEvents = assetBalanceChanges?.filter(c => c.type === 'credit') || [];
    if (creditEvents.length > 0) {
      const phaseNodeId = 'phase-credit';
      generatedNodes.push({
        id: phaseNodeId,
        type: 'operation',
        position: { x: xCenter, y: yOffset },
        data: {
          stepNumber: '',
          emoji: '',
          title: '',
          content: [],
          isPhaseHeader: true,
          phaseEmoji: '💰',
          phaseTitle: 'CREDITING PHASE',
          phaseDescription: 'Tokens credited to wallet',
        },
      });

      lastNodeIds.forEach(prevId => {
        generatedEdges.push({
          id: `${prevId}-${phaseNodeId}`,
          source: prevId,
          target: phaseNodeId,
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#64748b', strokeWidth: 2 },
        });
      });

      yOffset += 180;

      const nodeId = 'final-credit';

      // Calculate total, handling both formatted and raw amounts
      const totalAmount = creditEvents.reduce((sum, c) => {
        if (!c.amount) return sum;
        const amountStr = String(c.amount);
        let numericAmount = 0;

        if (amountStr.includes('.')) {
          // Already formatted
          numericAmount = parseFloat(amountStr);
        } else if (!isNaN(Number(amountStr))) {
          // Raw amount - needs formatting
          const formatted = formatAmount(amountStr);
          numericAmount = parseFloat(formatted.formatted);
        }

        return sum + numericAmount;
      }, 0);

      const tokenCode = creditEvents[0]?.asset_code || 'tokens';
      const displayTotal = totalAmount.toFixed(7).replace(/\.?0+$/, '');

      generatedNodes.push({
        id: nodeId,
        type: 'operation',
        position: { x: xCenter, y: yOffset },
        data: {
          stepNumber: '💰',
          emoji: '💰',
          title: `Total: ${displayTotal} ${tokenCode}`,
          content: [`Credited to ${formatAddress(creditEvents[0]?.to || sourceAccount || 'wallet')}`],
        },
      });

      generatedEdges.push({
        id: `${phaseNodeId}-${nodeId}`,
        source: phaseNodeId,
        target: nodeId,
        type: 'smoothstep',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#10b981', strokeWidth: 2 },
      });
    }

    setNodes(generatedNodes);
    setEdges(generatedEdges);
  }, [events, sourceAccount, functionName, assetBalanceChanges]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.3, duration: 200 });
    }, 50);
    return () => clearTimeout(timer);
  }, [nodes.length, fitView]);

  const onConnect = useCallback((params: Connection) => {
  }, []);

  return (
    <div className="w-full h-[800px] bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.1 }}
        className="bg-gray-50"
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls className="bg-white shadow-md border border-gray-100" />
        <MiniMap
          className="bg-white border border-gray-200 rounded"
          nodeColor="#3b82f6"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}

export function UserOperationFlow(props: UserOperationFlowProps) {
  return (
    <ReactFlowProvider>
      <UserOperationFlowInner {...props} />
    </ReactFlowProvider>
  );
}
