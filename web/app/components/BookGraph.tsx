'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { BookWithAuthor, BookNeighbor } from '../lib/api/types';
import { fetchBookGraph } from '../lib/api/graph';

const PRIMARY_RADIUS = 380;
const SECONDARY_EXTRA = 200;
const MIN_DISTANCE = 200;
const PRIMARY_W = 128;
const PRIMARY_H = 190;
const SECONDARY_W = 96;
const SECONDARY_H = 140;

type NodeLevel = 'focal' | 'primary' | 'secondary';

type BookNodeData = {
  label: string;
  author: string | null;
  cover: string | null;
  year: string | null;
  pages: number | null;
  language: string | null;
  isFocal: boolean;
  bookId: string;
  level: NodeLevel;
};

const shadowByLevel: Record<NodeLevel, string> = {
  focal:     '0 24px 48px rgba(0,0,0,0.22), 0 6px 12px rgba(0,0,0,0.14)',
  primary:   '0 10px 24px rgba(0,0,0,0.14), 0 3px 6px rgba(0,0,0,0.08)',
  secondary: '0 3px 8px rgba(0,0,0,0.08)',
};

function Badge({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 font-medium leading-none">
      {icon} {label}
    </span>
  );
}

function BookNodeComponent({ data }: { data: BookNodeData }) {
  const isSmall = data.level === 'secondary';
  const coverH = isSmall ? 'h-20' : 'h-28';
  const handleStyle = { opacity: 0, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden cursor-pointer select-none flex flex-col ${
        data.level === 'secondary' ? 'w-24 opacity-50'
        : data.level === 'primary' ? 'w-32 opacity-75'
        : 'w-32'
      } ${
        data.isFocal
          ? 'border-indigo-500 ring-2 ring-indigo-200'
          : 'border-zinc-200 hover:border-indigo-300'
      }`}
      style={{
        boxShadow: shadowByLevel[data.level],
        background: 'linear-gradient(160deg, #ffffff 0%, #f4f4f5 100%)',
        transition: 'opacity 0.6s ease, width 0.6s ease, font-size 0.6s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />

      {/* Cover */}
      {data.cover ? (
        <img src={data.cover} alt={data.label} className={`w-full object-cover ${coverH}`} />
      ) : (
        <div className={`w-full ${coverH} bg-indigo-50 flex items-center justify-center text-2xl`}>
          📚
        </div>
      )}

      {/* Text */}
      <div className="p-1.5 flex flex-col gap-1">
        <p className="font-semibold line-clamp-2 leading-tight text-black" style={{ fontSize: isSmall ? '10px' : '12px' }}>
          {data.label}
        </p>
        {data.author && (
          <p className="text-zinc-400 truncate" style={{ fontSize: isSmall ? '9px' : '10px' }}>
            {data.author}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          <Badge icon="📅" label={data.year ?? '—'} />
          <Badge icon="📄" label={data.pages ? `${data.pages}p` : '—'} />
          <Badge icon="🌐" label={data.language ?? '—'} />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

const nodeTypes = { book: BookNodeComponent as never };

type SecondaryEntry = { book: BookWithAuthor; similarity_score: number; parentId: string };

function bookData(b: BookWithAuthor, level: NodeLevel, isFocal = false): BookNodeData {
  return {
    label: b.title,
    author: b.author ?? null,
    cover: b.cover_image_href,
    year: b.published_date ? b.published_date.slice(0, 4) : null,
    pages: b.page_count ?? null,
    language: b.language ?? null,
    isFocal,
    bookId: b.id,
    level,
  };
}

function buildExpandedGraph(
  focal: BookWithAuthor,
  primaries: BookNeighbor[],
  secondaries: SecondaryEntry[]
): { nodes: Node[]; edges: Edge[] } {
  const angleStep = (2 * Math.PI) / Math.max(primaries.length, 1);

  const primaryMeta = primaries.map((p, i) => ({
    angle: angleStep * i,
    distance: Math.max(MIN_DISTANCE, (1 - p.similarity_score) * PRIMARY_RADIUS),
  }));

  const nodes: Node[] = [
    {
      id: focal.id,
      type: 'book',
      zIndex: 10,
      position: { x: -PRIMARY_W / 2, y: -PRIMARY_H / 2 },
      data: bookData(focal, 'focal', true) as unknown as Record<string, unknown>,
    },
    ...primaries.map((p, i) => ({
      id: p.id,
      type: 'book',
      zIndex: 5,
      position: {
        x: Math.cos(primaryMeta[i].angle) * primaryMeta[i].distance - PRIMARY_W / 2,
        y: Math.sin(primaryMeta[i].angle) * primaryMeta[i].distance - PRIMARY_H / 2,
      },
      data: bookData(p, 'primary') as unknown as Record<string, unknown>,
    })),
    ...secondaries.map((s) => {
      const parentIdx = primaries.findIndex((p) => p.id === s.parentId);
      const { angle, distance } = primaryMeta[parentIdx];
      const secDist = distance + SECONDARY_EXTRA;
      return {
        id: s.book.id,
        type: 'book',
        zIndex: 1,
        position: {
          x: Math.cos(angle) * secDist - SECONDARY_W / 2,
          y: Math.sin(angle) * secDist - SECONDARY_H / 2,
        },
        data: bookData(s.book, 'secondary') as unknown as Record<string, unknown>,
      };
    }),
  ];

  const edges: Edge[] = [
    ...primaries.map((p) => ({
      id: `${focal.id}-${p.id}`,
      source: focal.id,
      target: p.id,
      type: 'straight',
      data: { similarity_score: p.similarity_score },
      style: { strokeWidth: 1.5 },
    })),
    ...secondaries.map((s) => ({
      id: `${s.parentId}-${s.book.id}`,
      source: s.parentId,
      target: s.book.id,
      type: 'straight',
      data: { similarity_score: s.similarity_score },
      style: { strokeWidth: 1.5, strokeDasharray: '5 3' },
    })),
  ];

  return { nodes, edges };
}

function BookGraphInner({ initialBookId }: { initialBookId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState(initialBookId);
  const [fading, setFading] = useState(true);
  const [edgeScore, setEdgeScore] = useState<number | null>(null);
  const { fitView, setCenter, getZoom } = useReactFlow();

  // Load graph once on mount — never rebuilds on click
  useEffect(() => {
    (async () => {
      const { focal, neighbors: primaries } = await fetchBookGraph(initialBookId, 5);
      const shownIds = new Set([initialBookId, ...primaries.map((p) => p.id)]);

      const secondaryResults = await Promise.all(
        primaries.map(async (primary) => {
          const { neighbors } = await fetchBookGraph(primary.id, 10);
          const candidate = neighbors.find((n) => !shownIds.has(n.id));
          if (candidate) {
            shownIds.add(candidate.id);
            return { book: candidate, similarity_score: candidate.similarity_score, parentId: primary.id };
          }
          return null;
        })
      );

      const secondaries = secondaryResults.filter(Boolean) as SecondaryEntry[];
      const { nodes: n, edges: e } = buildExpandedGraph(focal, primaries, secondaries);
      setNodes(n);
      setEdges(e);
      setFading(false);
      setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const { bookId, level } = node.data as BookNodeData;
      if (bookId === selectedId) return;

      setEdgeScore(null);
      setSelectedId(bookId);

      // Remap levels based on connectivity — no positions change
      setEdges((currentEdges) => {
        const directNeighborIds = new Set<string>();
        currentEdges.forEach((e) => {
          if (e.source === bookId) directNeighborIds.add(e.target);
          if (e.target === bookId) directNeighborIds.add(e.source);
        });

        setNodes((prev) =>
          prev.map((n) => {
            const data = n.data as BookNodeData;
            const newLevel: NodeLevel =
              n.id === bookId ? 'focal'
              : directNeighborIds.has(n.id) ? 'primary'
              : 'secondary';
            return {
              ...n,
              zIndex: newLevel === 'focal' ? 10 : newLevel === 'primary' ? 5 : 1,
              data: { ...data, level: newLevel, isFocal: n.id === bookId } as unknown as Record<string, unknown>,
            };
          })
        );

        return currentEdges;
      });

      // Pan viewport to the clicked node
      const w = level === 'secondary' ? SECONDARY_W : PRIMARY_W;
      const h = level === 'secondary' ? SECONDARY_H : PRIMARY_H;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: getZoom(), duration: 400 });
    },
    [selectedId, setCenter, getZoom]
  );

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdgeScore((edge.data as { similarity_score: number }).similarity_score);
  }, []);

  return (
    <div
      className="relative w-full h-full"
      style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.2s ease' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        fitView
        className="bg-gray-50"
      >
        <Controls />
        {edgeScore !== null && (
          <Panel position="top-right">
            <div className="bg-white rounded-lg shadow-md px-3 py-2 text-sm font-medium text-black">
              Similarity: {(edgeScore * 100).toFixed(0)}%
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function BookGraph({ initialBookId }: { initialBookId: string }) {
  return (
    <ReactFlowProvider>
      <div style={{ width: '100%', height: '600px' }}>
        <BookGraphInner initialBookId={initialBookId} />
      </div>
    </ReactFlowProvider>
  );
}
