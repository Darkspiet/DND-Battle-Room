"use client";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ViewportPortal,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler
} from "@xyflow/react";
import { MapPin, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { createUuid } from "../../lib/domain/id";
import type { WorldConnection, WorldLocation, WorldMapSettings } from "../../lib/domain/types";

type Props = {
  campaignId: string;
  connections: WorldConnection[];
  editable: boolean;
  locations: WorldLocation[];
  worldMap?: WorldMapSettings;
  onChanged?: () => void;
  onCreateLocation?: () => void;
  onOpenScene: (location: WorldLocation) => void;
  onSelectLocation?: (location: WorldLocation) => void;
};

function toNodes(locations: WorldLocation[]): Node[] {
  return locations.map((location) => ({
    id: location.id,
    position: { x: location.x, y: location.y },
    data: {
      label: (
        <div className="world-node-label">
          <span>
            <MapPin aria-hidden="true" />
          </span>
          <div>
            <strong>{location.name}</strong>
            <small>{location.revealed ? "Visible to players" : "DM only"}</small>
          </div>
        </div>
      )
    },
    className: location.revealed ? "world-node revealed" : "world-node hidden-location",
    sourcePosition: Position.Right,
    targetPosition: Position.Left
  }));
}

function toEdges(connections: WorldConnection[]): Edge[] {
  return connections.map((connection) => ({
    id: connection.id,
    source: connection.sourceLocationId,
    target: connection.targetLocationId,
    label: connection.label || undefined,
    className: connection.revealed ? "world-edge" : "world-edge hidden-connection",
    markerEnd: { type: MarkerType.ArrowClosed, color: connection.revealed ? "#c7ad67" : "#697078" }
  }));
}

export function WorldCanvas({
  campaignId,
  connections,
  editable,
  locations,
  worldMap,
  onChanged,
  onCreateLocation,
  onOpenScene,
  onSelectLocation
}: Props) {
  const initialNodes = useMemo(() => toNodes(locations), [locations]);
  const initialEdges = useMemo(() => toEdges(connections), [connections]);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [error, setError] = useState("");

  useEffect(() => setNodes(initialNodes), [initialNodes]);
  useEffect(() => setEdges(initialEdges), [initialEdges]);

  const onNodesChange = (changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current));
  const onEdgesChange = (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current));

  async function connect(connection: Connection) {
    if (!editable || !connection.source || !connection.target || connection.source === connection.target) return;
    const optimistic: Edge = {
      id: `draft-${createUuid()}`,
      source: connection.source,
      target: connection.target
    };
    setEdges((current) => addEdge(optimistic, current));
    try {
      await apiFetch(`/api/v1/campaigns/${campaignId}/connections`, {
        method: "POST",
        body: JSON.stringify({
          sourceLocationId: connection.source,
          targetLocationId: connection.target,
          label: "",
          revealed: true
        })
      });
      onChanged?.();
    } catch (caught) {
      setError(errorMessage(caught));
      setEdges((current) => current.filter((edge) => edge.id !== optimistic.id));
    }
  }

  async function persistPosition(_event: MouseEvent, node: Node) {
    if (!editable) return;
    try {
      await apiFetch(`/api/v1/campaigns/${campaignId}/locations/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ x: node.position.x, y: node.position.y })
      });
      onChanged?.();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const selectNode: NodeMouseHandler = (_event, node) => {
    const location = locations.find((candidate) => candidate.id === node.id);
    if (location) onSelectLocation?.(location);
  };

  const openNode: NodeMouseHandler = (_event, node) => {
    const location = locations.find((candidate) => candidate.id === node.id);
    if (location) onOpenScene(location);
  };

  return (
    <section className="world-canvas" aria-label="Campaign world map">
      <ReactFlow
        colorMode="dark"
        connectOnClick={editable}
        edges={edges}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.25}
        nodes={nodes}
        nodesConnectable={editable}
        nodesDraggable={editable}
        onConnect={(connection) => void connect(connection)}
        onEdgesChange={onEdgesChange}
        onNodeClick={selectNode}
        onNodeDoubleClick={openNode}
        onNodeDragStop={(event, node) => void persistPosition(event as unknown as MouseEvent, node)}
        onNodesChange={onNodesChange}
        proOptions={{ hideAttribution: false }}
      >
        {worldMap?.backgroundAssetId ? (
          <ViewportPortal>
            {/* The permission-aware asset URL and user-controlled dimensions are not compatible with Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="world-map-background"
              draggable={false}
              src={`/api/v1/assets/${worldMap.backgroundAssetId}`}
              style={{
                left: worldMap.x,
                opacity: worldMap.opacity,
                top: worldMap.y,
                transform: `scale(${worldMap.scale})`
              }}
            />
          </ViewportPortal>
        ) : null}
        <Background color="rgba(213, 219, 214, .12)" gap={32} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          className="world-minimap"
          nodeColor={(node) => (node.className?.includes("hidden-location") ? "#697078" : "#b83c52")}
          pannable
          zoomable
        />
      </ReactFlow>
      {editable && onCreateLocation ? (
        <button className="button secondary-button world-add" onClick={onCreateLocation} type="button">
          <Plus aria-hidden="true" /> Add location
        </button>
      ) : null}
      {error ? (
        <p className="canvas-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
