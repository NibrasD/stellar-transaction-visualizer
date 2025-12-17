import React, { useCallback, useState, useEffect } from 'react';
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

import { OperationNode, TransactionEffect, SorobanOperation, SimulationResult } from '../types/stellar';
import { OperationNodeComponent } from './OperationNode';
import { StateChangeNode } from './StateChangeNode';
import { EventNode } from './EventNode';
import { EffectNode } from './EffectNode';
import { TransactionEffects } from './TransactionEffects';

const nodeTypes: NodeTypes = {
  operation: OperationNodeComponent,
  stateChange: StateChangeNode,
  event: EventNode,
  effect: EffectNode,
};

interface TransactionFlowProps {
  nodes: Node<OperationNode>[];
  edges: Edge[];
  effects?: TransactionEffect[];
  sorobanOperations?: SorobanOperation[];
  simulationResult?: SimulationResult;
}

function TransactionFlowInner({ nodes, edges, effects = [], sorobanOperations = [], simulationResult }: TransactionFlowProps) {
  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'staggered' | 'vertical'>('horizontal');
  const [showConnections, setShowConnections] = useState(false);
  const [executionStep, setExecutionStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [executionSpeed, setExecutionSpeed] = useState(1000);
  const { fitView } = useReactFlow();

  useEffect(() => {
    const timer = setTimeout(() => {
      // Allow more zoom out to prevent nodes from being compressed and overlapping
      fitView({ padding: 0.2, maxZoom: 1.5, minZoom: 0.3, duration: 0 });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes.length, layoutMode, fitView]);

  const onConnect = useCallback((params: Connection) => {
  }, []);

  const handleLayoutChange = () => {
    setLayoutMode(prev => {
      if (prev === 'horizontal') return 'staggered';
      if (prev === 'staggered') return 'vertical';
      return 'horizontal';
    });
  };

  const handlePlayPause = () => {
    if (executionStep >= nodes.length - 1) {
      setExecutionStep(-1);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setExecutionStep(-1);
    setIsPlaying(false);
  };

  const handleStepForward = () => {
    if (executionStep < nodes.length - 1) {
      setExecutionStep(prev => prev + 1);
    }
  };

  const handleStepBackward = () => {
    if (executionStep > -1) {
      setExecutionStep(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (isPlaying && executionStep < nodes.length - 1) {
      const timer = setTimeout(() => {
        setExecutionStep(prev => prev + 1);
      }, executionSpeed);
      return () => clearTimeout(timer);
    } else if (executionStep >= nodes.length - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, executionStep, nodes.length, executionSpeed]);

  const adjustedNodes = React.useMemo(() => {
    // Hide nodes in vertical and staggered views
    if (layoutMode === 'vertical' || layoutMode === 'staggered') {
      return [];
    }

    // Build a tree structure from diagnostic logs if available
    const buildHierarchicalLayout = () => {
      // Check if we have simulation results with diagnostic logs
      if (!simulationResult?.enhancedDebugInfo?.operationBreakdown) {
        return null;
      }

      const operationBreakdown = simulationResult.enhancedDebugInfo.operationBreakdown;
      if (!operationBreakdown || operationBreakdown.length === 0) {
        return null;
      }

      // Get logs from the first operation
      const logs = operationBreakdown[0]?.logs || [];
      if (logs.length === 0) {
        return null;
      }

      // Parse contract calls from diagnostic logs
      const callStack: Array<{id: string; level: number; parent: number; contract: string; fn: string; args: string; result: string; type: 'invoke' | 'event' | 'effect'}> = [];
      let callIndex = 0;

      logs.forEach((log: string, idx: number) => {
        // Match: "Invoked contract CDLZ...IGWA harvest(GDTL...YZFE, 102954u32) → 13049517i128"
        // Also match full contract IDs like "CATR...UMKI" or "CATRUMKI..."
        const invokeMatch = log.match(/^( *)Invoked contract ([A-Z0-9]{4,56})[.…]+([A-Z0-9]{4}) ([a-zA-Z_]+)\(([^)]*)\)( → (.+))?/);

        // Match: "GD3I...5QZS invoked contract CBGS...KKY3 harvest(...) → [...]"
        const topLevelMatch = log.match(/^([A-Z0-9]{4,56})[.…]+([A-Z0-9]{4}) invoked contract ([A-Z0-9]{4,56})[.…]+([A-Z0-9]{4}) ([a-zA-Z_]+)\(([^)]*)\)( → (.+))?/);

        // Match minted/credited effects: "78.4416776 XLMstellar.org credited to contract CATR…UMKI"
        const effectMatch = log.match(/^ *([0-9.]+) ([A-Z]+[a-z.]*)[^ ]* (minted|credited|transferred|burned)/);

        // Match events: "Contract CAS3...OWMA raised event [...] with data ..."
        const eventMatch = log.match(/^ *Contract ([A-Z0-9]{4,56})[.…]+([A-Z0-9]{4}) raised event/);

        if (topLevelMatch) {
          // Top-level invocation
          const [, accountStart, accountEnd, contractStart, contractEnd, fn, args, , result] = topLevelMatch;
          callStack.push({
            id: `call-${callIndex++}`,
            level: 0,
            parent: -1,
            contract: `${contractStart}…${contractEnd}`,
            fn: fn,
            args: args || '',
            result: result || '',
            type: 'invoke'
          });
        } else if (invokeMatch) {
          // Nested invocation
          const [, indent, contractStart, contractEnd, fn, args, , result] = invokeMatch;
          const level = Math.floor(indent.length / 1) + 1; // Each space = 1 level deeper

          callStack.push({
            id: `call-${callIndex++}`,
            level: level,
            parent: callStack.length > 0 ? callStack.length - 1 : -1,
            contract: `${contractStart}…${contractEnd}`,
            fn: fn,
            args: args || '',
            result: result || '',
            type: 'invoke'
          });
        } else if (effectMatch) {
          // Effects like minted/credited
          const [, amount, asset, action] = effectMatch;
          const indent = log.match(/^ */)![0].length;
          const level = Math.floor(indent / 1) + 1;

          callStack.push({
            id: `effect-${callIndex++}`,
            level: level,
            parent: callStack.length > 0 ? callStack.length - 1 : -1,
            contract: asset,
            fn: action,
            args: amount,
            result: '',
            type: 'effect'
          });
        }
      });

      return callStack.filter(c => c.type === 'invoke'); // Only show contract invocations for now
    };

    const hierarchy = buildHierarchicalLayout();

    // If we have hierarchical data, use tree layout
    if (hierarchy && hierarchy.length > 0) {
      const nodeWidth = 320;
      const nodeHeight = 140;
      const verticalGap = 70;
      const levelWidth = 1000;

      // Group by level
      const levels: typeof hierarchy[] = [];
      hierarchy.forEach(call => {
        if (!levels[call.level]) levels[call.level] = [];
        levels[call.level].push(call);
      });

      // Calculate total height needed for each level
      const levelHeights = levels.map(level => level ? level.length * (nodeHeight + verticalGap) : 0);
      const maxHeight = Math.max(...levelHeights);

      // Position nodes HORIZONTALLY (x increases with level, y for position within level)
      const layoutNodes = hierarchy.map((call, index) => {
        const levelNodes = levels[call.level];
        const posInLevel = levelNodes.indexOf(call);
        const totalInLevel = levelNodes.length;
        const levelHeight = totalInLevel * (nodeHeight + verticalGap);

        // Center the level vertically
        const levelStartY = (maxHeight - levelHeight) / 2;
        const yPos = levelStartY + posInLevel * (nodeHeight + verticalGap) + nodeHeight / 2;
        const xPos = call.level * levelWidth + 100;

        const isExecuted = index <= executionStep;
        const isExecuting = index === executionStep;

        return {
          id: call.id,
          type: 'operation',
          position: { x: xPos, y: yPos },
          data: {
            type: 'invoke_host_function',
            contractId: call.contract,
            functionName: call.fn,
            args: call.args,
            result: call.result,
            level: call.level,
            executionState: executionStep === -1 ? undefined : (isExecuting ? 'executing' : (isExecuted ? 'completed' : 'pending')),
            isExecuting,
          },
          style: {
            opacity: executionStep === -1 ? 1 : (isExecuted ? 1 : 0.3),
            transition: 'all 0.3s ease-in-out',
          },
        };
      });

      return layoutNodes;
    }

    // VERTICAL VIEW MODE - Smart grouping and layout
    if (layoutMode === 'vertical') {
      const NODE_HEIGHT = 180;
      const VERTICAL_GAP = 100;
      const COLUMN_WIDTH = 550;

      // Better grouping: only group with PREVIOUS operation if they share accounts/assets
      // This prevents transitive grouping and maintains chronological order
      interface NodeWithGroup {
        node: typeof nodes[0];
        groupIndex: number;
        originalIndex: number;
      }

      const nodesWithGroups: NodeWithGroup[] = [];
      let currentGroup = 0;

      nodes.forEach((node, index) => {
        const opData = node.data;

        // Extract current operation's accounts and assets
        const currentAccounts = new Set<string>();
        const currentAssets = new Set<string>();

        if (opData.source_account) currentAccounts.add(opData.source_account);
        if (opData.from) currentAccounts.add(opData.from);
        if (opData.to || opData.destination) currentAccounts.add(opData.to || opData.destination);
        if (opData.account) currentAccounts.add(opData.account);

        if (opData.asset_type) currentAssets.add(`${opData.asset_code || 'XLM'}-${opData.asset_issuer || 'native'}`);
        if (opData.source_asset_type) currentAssets.add(`${opData.source_asset_code || 'XLM'}-${opData.source_asset_issuer || 'native'}`);
        if (opData.destination_asset_type) currentAssets.add(`${opData.destination_asset_code || 'XLM'}-${opData.destination_asset_issuer || 'native'}`);

        // Check if this operation shares accounts/assets with the PREVIOUS operation only
        let shouldStartNewGroup = true;

        if (index > 0) {
          const prevNodeWithGroup = nodesWithGroups[index - 1];
          const prevData = prevNodeWithGroup.node.data;

          const prevAccounts = new Set<string>();
          const prevAssets = new Set<string>();

          if (prevData.source_account) prevAccounts.add(prevData.source_account);
          if (prevData.from) prevAccounts.add(prevData.from);
          if (prevData.to || prevData.destination) prevAccounts.add(prevData.to || prevData.destination);
          if (prevData.account) prevAccounts.add(prevData.account);

          if (prevData.asset_type) prevAssets.add(`${prevData.asset_code || 'XLM'}-${prevData.asset_issuer || 'native'}`);
          if (prevData.source_asset_type) prevAssets.add(`${prevData.source_asset_code || 'XLM'}-${prevData.source_asset_issuer || 'native'}`);
          if (prevData.destination_asset_type) prevAssets.add(`${prevData.destination_asset_code || 'XLM'}-${prevData.destination_asset_issuer || 'native'}`);

          // Check for overlap
          const hasCommonAccount = Array.from(currentAccounts).some(acc => prevAccounts.has(acc));
          const hasCommonAsset = Array.from(currentAssets).some(asset => prevAssets.has(asset));

          if (hasCommonAccount || hasCommonAsset) {
            shouldStartNewGroup = false;
          }
        }

        if (shouldStartNewGroup && index > 0) {
          currentGroup++;
        }

        nodesWithGroups.push({
          node,
          groupIndex: currentGroup,
          originalIndex: index,
        });
      });

      // Count nodes per group
      const groupCounts = new Map<number, number>();
      nodesWithGroups.forEach(nwg => {
        groupCounts.set(nwg.groupIndex, (groupCounts.get(nwg.groupIndex) || 0) + 1);
      });

      // Position all nodes maintaining chronological order within each group
      const layoutNodes: any[] = [];
      const groupNodeCounts = new Map<number, number>();

      nodesWithGroups.forEach(({ node, groupIndex, originalIndex }) => {
        const isExecuted = originalIndex <= executionStep;
        const isExecuting = originalIndex === executionStep;
        const isPending = originalIndex > executionStep && executionStep !== -1;

        let executionState: 'pending' | 'executing' | 'completed' | 'failed' | undefined = undefined;
        if (executionStep !== -1) {
          if (isExecuting) {
            executionState = 'executing';
          } else if (isExecuted) {
            const operationSuccess = node.data?.operation?.transaction_successful !== false;
            executionState = operationSuccess ? 'completed' : 'failed';
          } else if (isPending) {
            executionState = 'pending';
          }
        }

        // Calculate position
        const nodeIndexInGroup = groupNodeCounts.get(groupIndex) || 0;
        groupNodeCounts.set(groupIndex, nodeIndexInGroup + 1);

        const xPos = groupIndex * COLUMN_WIDTH + 100;
        const yPos = nodeIndexInGroup * (NODE_HEIGHT + VERTICAL_GAP) + 150;

        layoutNodes.push({
          ...node,
          position: { x: xPos, y: yPos },
          data: {
            ...node.data,
            executionState,
            isExecuting,
            groupIndex,
            originalIndex,
          },
          style: {
            opacity: executionStep === -1 ? 1 : (isExecuted ? 1 : 0.3),
            transition: 'all 0.3s ease-in-out',
          },
        });
      });

      // Add group headers
      const groupHeaders: any[] = [];
      groupCounts.forEach((count, groupIndex) => {
        const groupNodes = nodesWithGroups.filter(nwg => nwg.groupIndex === groupIndex);
        let groupLabel = `Flow ${groupIndex + 1}`;

        // Determine label from first operation
        if (groupNodes.length > 0) {
          const firstNode = groupNodes[0].node;
          const nodeType = firstNode.data.type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          if (count === 1) {
            groupLabel = nodeType || groupLabel;
          } else {
            groupLabel = `${nodeType} + ${count - 1} more`;
          }
        }

        groupHeaders.push({
          id: `group-header-${groupIndex}`,
          type: 'default',
          position: { x: groupIndex * COLUMN_WIDTH + 100, y: 50 },
          data: {
            label: groupLabel,
          },
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: '2px solid #5a67d8',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '12px',
            fontWeight: 600,
            width: 'auto',
            minWidth: '140px',
            textAlign: 'center',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          },
          draggable: false,
          selectable: false,
        });
      });

      return [...groupHeaders, ...layoutNodes];
    }

    // HORIZONTAL AND STAGGERED VIEWS - preserve positions from createOperationNodes
    return nodes.map((node, index) => {
      const isExecuted = index <= executionStep;
      const isExecuting = index === executionStep;
      const isPending = index > executionStep && executionStep !== -1;

      let executionState: 'pending' | 'executing' | 'completed' | 'failed' | undefined = undefined;
      if (executionStep !== -1) {
        if (isExecuting) {
          executionState = 'executing';
        } else if (isExecuted) {
          const operationSuccess = node.data?.operation?.transaction_successful !== false;
          executionState = operationSuccess ? 'completed' : 'failed';
        } else if (isPending) {
          executionState = 'pending';
        }
      }

      // Apply layout mode: horizontal = same Y, staggered = alternate Y positions
      // Keep original X position from stellar.ts, only override Y for horizontal alignment
      // Always use Y=50 to ensure perfect horizontal alignment
      const position = layoutMode === 'horizontal'
        ? { x: node.position.x, y: 50 }
        : { x: node.position.x, y: index % 2 === 0 ? 50 : 200 };

      return {
        ...node,
        position,
        data: {
          ...node.data,
          executionState,
          isExecuting,
        },
        style: {
          opacity: executionStep === -1 ? 1 : (isExecuted ? 1 : 0.3),
          transition: 'all 0.3s ease-in-out',
        },
      };
    });
  }, [nodes, executionStep, layoutMode, simulationResult]);

  const adjustedEdges = React.useMemo(() => {
    if (!showConnections) return [];

    // VERTICAL VIEW - Smart edge generation
    if (layoutMode === 'vertical') {
      const verticalEdges: Edge[] = [];

      // Filter out header nodes
      const operationNodes = adjustedNodes.filter(n => !n.id.startsWith('group-header'));

      // Sort by original index to maintain chronological order
      const sortedNodes = [...operationNodes].sort((a, b) => {
        const aIndex = a.data.originalIndex ?? 0;
        const bIndex = b.data.originalIndex ?? 0;
        return aIndex - bIndex;
      });

      // Connect operations in chronological order
      for (let i = 0; i < sortedNodes.length - 1; i++) {
        const sourceNode = sortedNodes[i];
        const targetNode = sortedNodes[i + 1];
        const sourceIndex = sourceNode.data.originalIndex ?? 0;
        const isActive = sourceIndex <= executionStep;

        const sourceGroup = sourceNode.data.groupIndex ?? 0;
        const targetGroup = targetNode.data.groupIndex ?? 0;
        const isSameGroup = sourceGroup === targetGroup;

        verticalEdges.push({
          id: `edge-${sourceNode.id}-${targetNode.id}`,
          source: sourceNode.id,
          target: targetNode.id,
          type: isSameGroup ? 'smoothstep' : 'default',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: isActive ? (isSameGroup ? '#10b981' : '#f59e0b') : (isSameGroup ? '#3b82f6' : '#6366f1'),
          },
          style: {
            stroke: isActive ? (isSameGroup ? '#10b981' : '#f59e0b') : (isSameGroup ? '#3b82f6' : '#6366f1'),
            strokeWidth: isActive ? (isSameGroup ? 3 : 2.5) : (isSameGroup ? 2 : 1.5),
            strokeDasharray: isSameGroup ? '0' : '5,5',
            opacity: executionStep === -1 ? (isSameGroup ? 1 : 0.6) : (isActive ? (isSameGroup ? 1 : 0.8) : 0.3),
            transition: 'all 0.3s ease-in-out',
          },
          animated: isActive && isSameGroup,
        });
      }

      return verticalEdges;
    }

    // Check if we're using hierarchical layout
    const isHierarchical = adjustedNodes.some(n => n.data.level !== undefined);

    if (isHierarchical) {
      // Create edges based on parent-child relationships
      const hierarchicalEdges: Edge[] = [];

      // Build parent-child map from adjusted nodes
      const nodesByLevel: any[][] = [];
      adjustedNodes.forEach(node => {
        const level = node.data.level || 0;
        if (!nodesByLevel[level]) nodesByLevel[level] = [];
        nodesByLevel[level].push(node);
      });

      // Connect each node to its parent (node from previous level)
      for (let level = 1; level < nodesByLevel.length; level++) {
        const currentLevelNodes = nodesByLevel[level] || [];
        const parentLevelNodes = nodesByLevel[level - 1] || [];

        // Simple strategy: connect to the parent that called it
        // For now, connect first child to first parent, etc.
        currentLevelNodes.forEach((childNode, idx) => {
          const parentNode = parentLevelNodes[Math.floor(idx / Math.max(1, currentLevelNodes.length / parentLevelNodes.length))];
          if (parentNode) {
            const sourceIndex = adjustedNodes.findIndex(n => n.id === parentNode.id);
            const isActive = sourceIndex <= executionStep;

            hierarchicalEdges.push({
              id: `edge-${parentNode.id}-${childNode.id}`,
              source: parentNode.id,
              target: childNode.id,
              type: 'straight',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 25,
                height: 25,
                color: isActive ? '#10b981' : '#2563eb',
              },
              style: {
                stroke: isActive ? '#10b981' : '#2563eb',
                strokeWidth: isActive ? 3 : 2,
                opacity: executionStep === -1 ? 1 : (isActive ? 1 : 0.3),
                transition: 'all 0.3s ease-in-out',
              },
              animated: isActive,
            });
          }
        });
      }

      return hierarchicalEdges;
    }

    // Use original edges for non-hierarchical layout
    return edges.map((edge, index) => {
      const sourceIndex = adjustedNodes.findIndex(n => n.id === edge.source);
      const isActive = sourceIndex <= executionStep;

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'straight',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 25,
          height: 25,
          color: isActive ? '#10b981' : '#2563eb',
        },
        style: {
          stroke: isActive ? '#10b981' : '#2563eb',
          strokeWidth: isActive ? 4 : 3,
          opacity: executionStep === -1 ? 1 : (isActive ? 1 : 0.3),
          transition: 'all 0.3s ease-in-out',
        },
        animated: true,
      };
    });
  }, [showConnections, adjustedNodes, executionStep, edges]);

  // Check if we have any Soroban operations
  const hasSorobanOps = sorobanOperations && sorobanOperations.length > 0;

  // Format helper functions
  const formatAccountId = (id: string) => {
    if (!id || id.length < 10) return id;
    return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
  };

  const formatContractId = (id: string) => {
    if (!id || id === 'Unknown Contract' || id.length < 10) return id;
    return `${id.substring(0, 6)}...${id.substring(id.length - 6)}`;
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'number') {
      return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    if (typeof val === 'string') {
      if (val.length > 20 && (val.startsWith('G') || val.startsWith('C'))) {
        return formatAccountId(val);
      }
      return val;
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-4">
      {/* Operation Flow Diagram */}
      <div className="w-full h-[800px] bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative">
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => setShowConnections(!showConnections)}
          className="px-3 py-1.5 bg-white rounded-md shadow-sm border border-gray-200 text-sm font-medium hover:bg-gray-50"
        >
          {showConnections ? 'Hide Arrows' : 'Show Arrows'}
        </button>
      </div>
      <ReactFlow
        nodes={adjustedNodes}
        edges={adjustedEdges}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        fitView={true}
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5, minZoom: 0.3 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
        className="bg-gray-50"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'straight',
          style: { stroke: '#2563eb', strokeWidth: 3 },
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 25,
            height: 25,
            color: '#2563eb',
          },
        }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls className="bg-white shadow-md border border-gray-100" showFitView={true} showInteractive={false} />
        <MiniMap 
          className="bg-white border border-gray-200 rounded"
          nodeColor="#3b82f6"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>

      {executionStep !== -1 && (
        <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-white rounded-lg shadow-xl border-2 p-4 max-w-2xl ${
          executionStep >= nodes.length - 1 && !isPlaying
            ? nodes[0]?.data?.operation?.transaction_successful !== false
              ? 'border-green-400'
              : 'border-red-400'
            : 'border-blue-400'
        }`}>
          {executionStep < nodes.length - 1 || isPlaying ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full animate-pulse">
                <span className="text-white font-bold text-sm">{executionStep + 1}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Currently Executing: <span className="text-blue-600">{adjustedNodes[executionStep]?.data?.type?.replace(/_/g, ' ')}</span>
                </p>
                {adjustedNodes[executionStep]?.data?.functionName && (
                  <p className="text-xs text-gray-600 mt-1">
                    Function: <span className="font-mono text-purple-600">{adjustedNodes[executionStep]?.data?.functionName}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                nodes[0]?.data?.operation?.transaction_successful !== false
                  ? 'bg-green-500'
                  : 'bg-red-500'
              }`}>
                <span className="text-white font-bold text-sm">
                  {nodes[0]?.data?.operation?.transaction_successful !== false ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  nodes[0]?.data?.operation?.transaction_successful !== false
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}>
                  Execution {nodes[0]?.data?.operation?.transaction_successful !== false ? 'Completed Successfully' : 'Failed'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {nodes.length} operation{nodes.length > 1 ? 's' : ''} processed
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

export function TransactionFlow(props: TransactionFlowProps) {
  return (
    <ReactFlowProvider>
      <TransactionFlowInner {...props} />
    </ReactFlowProvider>
  );
}