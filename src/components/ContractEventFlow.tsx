import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  NodeTypes,
  MiniMap,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface ContractEvent {
  contractId: string;
  type: string;
  topics?: any[];
  data: any;
}

interface ContractEventFlowProps {
  events: ContractEvent[];
  onClose: () => void;
}

// Helper to format values
const formatValue = (val: any): string => {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') {
    if (val.length > 20 && (val.startsWith('G') || val.startsWith('C'))) {
      return `${val.substring(0, 6)}...${val.substring(val.length - 6)}`;
    }
    return val;
  }
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val.toString();
  if (Array.isArray(val)) {
    return val.map(v => formatValue(v)).join(', ');
  }
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return '[object]';
    }
  }
  return String(val);
};

// Custom node component for contract events
function ContractEventNode({ data }: any) {
  const event = data.event;
  const eventType = event.topics?.[0] || 'unknown';
  const isCall = eventType === 'fn_call';
  const isReturn = eventType === 'fn_return';

  const contractShort = event.contractId && event.contractId !== 'System'
    ? `${event.contractId.substring(0, 6)}...${event.contractId.substring(event.contractId.length - 6)}`
    : 'Contract';

  let title = '';
  let details: string[] = [];

  if (isCall) {
    const fnName = event.topics?.[2] || event.topics?.[1] || 'unknown';
    title = `📞 Call: ${formatValue(fnName)}`;

    // Add caller info
    if (event.topics?.[1]) {
      const caller = formatValue(event.topics[1]);
      if (caller && !caller.includes('...')) {
        details.push(`Caller: ${caller}`);
      }
    }

    // Add data/args
    if (event.data && Array.isArray(event.data)) {
      event.data.forEach((arg: any, idx: number) => {
        details.push(`arg${idx}: ${formatValue(arg)}`);
      });
    } else if (event.data !== null && event.data !== undefined) {
      details.push(`data: ${formatValue(event.data)}`);
    }
  } else if (isReturn) {
    const fnName = event.topics?.[1] || 'unknown';
    title = `↩️ Return: ${formatValue(fnName)}`;

    if (event.data && Array.isArray(event.data)) {
      event.data.forEach((val: any) => {
        details.push(`→ ${formatValue(val)}`);
      });
    } else if (event.data !== null && event.data !== undefined) {
      details.push(`→ ${formatValue(event.data)}`);
    }
  } else {
    title = `⚡ ${formatValue(eventType)}`;

    // Add topic details
    if (event.topics && event.topics.length > 1) {
      event.topics.slice(1).forEach((topic: any, idx: number) => {
        details.push(`topic${idx + 1}: ${formatValue(topic)}`);
      });
    }

    // Add data
    if (event.data !== null && event.data !== undefined) {
      details.push(`data: ${formatValue(event.data)}`);
    }
  }

  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 shadow-lg min-w-[280px] max-w-[400px]
      ${isCall ? 'bg-blue-50 border-blue-400' :
        isReturn ? 'bg-green-50 border-green-400' :
        'bg-purple-50 border-purple-400'}
    `}>
      <div className="font-semibold text-sm mb-2 flex items-center gap-2">
        <span className="truncate">{title}</span>
      </div>
      <div className="text-xs text-gray-600 mb-2 truncate">{contractShort}</div>
      {details.length > 0 && (
        <div className="space-y-1 text-xs font-mono">
          {details.map((detail, idx) => (
            <div key={idx} className="text-gray-700 truncate" title={detail}>
              {detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  contractEvent: ContractEventNode,
};

function ContractEventFlowInner({ events, onClose }: ContractEventFlowProps) {
  const { fitView } = useReactFlow();

  // Build flow graph from events
  const { nodes, edges } = React.useMemo(() => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Track nesting for layout
    const callStack: { id: string; depth: number }[] = [];
    let currentDepth = 0;
    let xOffset = 0;
    const X_SPACING = 350;
    const Y_SPACING = 150;

    events.forEach((event, index) => {
      const eventType = event.topics?.[0] || 'unknown';
      const nodeId = `event-${index}`;

      if (eventType === 'fn_call') {
        // Push to stack and increase depth
        const yPos = currentDepth * Y_SPACING;

        flowNodes.push({
          id: nodeId,
          type: 'contractEvent',
          data: { event },
          position: { x: xOffset, y: yPos },
        });

        // Create edge from previous node
        if (flowNodes.length > 1) {
          const prevId = flowNodes[flowNodes.length - 2].id;
          flowEdges.push({
            id: `edge-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
          });
        }

        callStack.push({ id: nodeId, depth: currentDepth });
        currentDepth++;
        xOffset += X_SPACING;

      } else if (eventType === 'fn_return') {
        // Pop from stack and decrease depth
        const callInfo = callStack.pop();
        if (callInfo) {
          currentDepth = callInfo.depth;
        } else {
          currentDepth = Math.max(0, currentDepth - 1);
        }

        const yPos = currentDepth * Y_SPACING;

        flowNodes.push({
          id: nodeId,
          type: 'contractEvent',
          data: { event },
          position: { x: xOffset, y: yPos },
        });

        // Create edge from call to return
        if (callInfo) {
          flowEdges.push({
            id: `edge-${callInfo.id}-${nodeId}`,
            source: callInfo.id,
            target: nodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
          });
        } else if (flowNodes.length > 1) {
          const prevId = flowNodes[flowNodes.length - 2].id;
          flowEdges.push({
            id: `edge-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
          });
        }

        xOffset += X_SPACING;

      } else {
        // Regular event
        const yPos = currentDepth * Y_SPACING;

        flowNodes.push({
          id: nodeId,
          type: 'contractEvent',
          data: { event },
          position: { x: xOffset, y: yPos },
        });

        // Create edge from previous node
        if (flowNodes.length > 1) {
          const prevId = flowNodes[flowNodes.length - 2].id;
          flowEdges.push({
            id: `edge-${prevId}-${nodeId}`,
            source: prevId,
            target: nodeId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#8b5cf6', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' },
          });
        }

        xOffset += X_SPACING;
      }
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [events]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.3, duration: 200 });
    }, 50);
    return () => clearTimeout(timer);
  }, [fitView]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col z-10 pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Contract Event Flow</h2>
            <p className="text-sm text-gray-600 mt-1">{events.length} events</p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>

        {/* Flow Diagram */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
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
              nodeColor={(node) => {
                const event = node.data?.event;
                const eventType = event?.topics?.[0];
                if (eventType === 'fn_call') return '#3b82f6';
                if (eventType === 'fn_return') return '#10b981';
                return '#8b5cf6';
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-400 border-2 border-blue-600"></div>
              <span>Function Call</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-400 border-2 border-green-600"></div>
              <span>Function Return</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-purple-400 border-2 border-purple-600"></div>
              <span>Other Event</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ContractEventFlow(props: ContractEventFlowProps) {
  return (
    <ReactFlowProvider>
      <ContractEventFlowInner {...props} />
    </ReactFlowProvider>
  );
}
