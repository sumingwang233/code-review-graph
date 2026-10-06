import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  type NodeChange,
} from "@xyflow/react";
import {
  Activity,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Command,
  FileCode2,
  FolderGit2,
  GitBranch,
  History,
  Layers3,
  LoaderCircle,
  Network,
  PanelRight,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  Terminal,
  Unplug,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  demoAdapter,
  demoCommands,
  initialState,
  replayTurns,
  restoreState,
  sessionNames,
  storageKey,
  connect,
  type GraphState,
  type SessionId,
} from "@/lib/memory/graph";
import { MemoryNode, type MemoryFlowNode } from "./MemoryNode";
import { MemoryInspector, displayTime } from "./MemoryInspector";
import { MemoryDrawers } from "./MemoryDrawers";
import { LiveWorkspace } from "./LiveWorkspace";
import { TwoGraphStage, usePrefersReducedMotion, ViewToggle } from "./TwoGraphStage";
import {
  createSampleExistingGraphAdapter,
  SAMPLE_REPOSITORY,
  type GraphScope,
} from "@/lib/codegraph/existing";
import {
  demoScripts,
  memoryRevision,
  newRun,
  stepDemo,
  type DemoRun,
} from "@/lib/codegraph/handoff";
import { Pause, SkipForward } from "lucide-react";
const sampleCodeAdapter = createSampleExistingGraphAdapter();
const demoScope = (conversationId: SessionId): GraphScope => ({
  ownerId: "local-owner",
  workspaceId: "demo-workspace",
  repositoryId: SAMPLE_REPOSITORY,
  conversationId,
});
const DEMO_STEP_MS = 5200;
const nodeTypes = { memory: MemoryNode };
const sessionIds: SessionId[] = ["billing", "deployment"];
type Feedback = { message: string; error: boolean };
export function MemoryWorkspace({ modeSwitch }: { modeSwitch?: ReactNode }) {
  const [states, setStates] = useState<Record<SessionId, GraphState>>(() => ({
    billing: initialState("billing"),
    deployment: initialState("deployment"),
  }));
  const [session, setSession] = useState<SessionId>("billing");
  const [ready, setReady] = useState(false);
  const [inspector, setInspector] = useState(true);
  const [feed, setFeed] = useState<"turns" | "activity" | null>(null);
  const [drawer, setDrawer] = useState<"context" | "connect" | null>(null);
  const [queries, setQueries] = useState<Record<SessionId, string>>({
    billing: "",
    deployment: "",
  });
  const [inputs, setInputs] = useState<Record<SessionId, string>>({ billing: "", deployment: "" });
  const [feedback, setFeedback] = useState<Partial<Record<SessionId, Feedback>>>({});
  const [running, setRunning] = useState<SessionId | null>(null);
  const [busy, setBusy] = useState<SessionId | null>(null);
  const [resetSession, setResetSession] = useState<SessionId | null>(null);
  const [persistError, setPersistError] = useState(false);
  const [view, setView] = useState<"dual" | "memory">("memory");
  const [runs, setRuns] = useState<Record<SessionId, DemoRun>>({
    billing: newRun("billing"),
    deployment: newRun("deployment"),
  });
  const reducedMotion = usePrefersReducedMotion();
  const codeGraph = useMemo(() => sampleCodeAdapter.load(demoScope(session)), [session]);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const timers = useRef(new Map<SessionId, ReturnType<typeof setTimeout>>());
  const runningRef = useRef<SessionId | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flow, setFlow] = useState<
    import("@xyflow/react").ReactFlowInstance<MemoryFlowNode> | null
  >(null);
  const state = states[session];
  const query = queries[session];
  const run = runs[session];
  const recalledIds = useMemo(
    () =>
      new Set(
        view === "dual" && run.trace && run.trace.stage !== "idle"
          ? (run.trace.capsule?.nodeIds ?? [])
          : [],
      ),
    [run, view],
  );
  const graph = useMemo(() => demoAdapter.getGraph(state), [state]);
  const nodes: MemoryFlowNode[] = useMemo(
    () =>
      graph.memories.map((memory) => ({
        id: memory.id,
        type: "memory",
        position: memory.position,
        measured: measurements[memory.id] ?? {},
        data: {
          memory,
          changed: state.changedIds.includes(memory.id),
          recalled: recalledIds.has(memory.id),
        },
        selected: state.selectedId === memory.id,
        dimmed: !!query && !memory.content.toLowerCase().includes(query.toLowerCase()),
        className:
          query && !memory.content.toLowerCase().includes(query.toLowerCase()) ? "opacity-30" : "",
        ariaLabel: `${memory.type}: ${memory.content}`,
      })),
    [graph.memories, state.changedIds, state.selectedId, query, measurements, recalledIds],
  );
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        label: edge.label,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        labelBgPadding: [7, 4] as [number, number],
        labelBgBorderRadius: 3,
        className:
          state.changedIds.includes(edge.source) || state.changedIds.includes(edge.target)
            ? "edge-changed"
            : "",
      })),
    [graph.edges, state.changedIds],
  );
  const selected = state.memories.find((m) => m.id === state.selectedId);
  const matches = query
    ? graph.memories.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
    : [];
  function update(id: SessionId, apply: (s: GraphState) => GraphState) {
    setStates((previous) => ({ ...previous, [id]: apply(previous[id]) }));
  }
  useEffect(() => {
    const pendingTimers = timers.current;
    try {
      setStates({
        billing: restoreState("billing", localStorage.getItem(storageKey("billing"))),
        deployment: restoreState("deployment", localStorage.getItem(storageKey("deployment"))),
      });
    } catch {
      setPersistError(true);
    }
    setReady(true);
    if (window.innerWidth < 1100) setInspector(false);
    return () => {
      pendingTimers.forEach(clearTimeout);
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      for (const id of sessionIds) localStorage.setItem(storageKey(id), JSON.stringify(states[id]));
    } catch {
      setPersistError(true);
    }
  }, [states, ready]);
  useEffect(() => {
    if (!running) return;
    const origin = running;
    if (states[origin].replayIndex >= replayTurns[origin].length) {
      runningRef.current = null;
      setRunning(null);
      return;
    }
    replayTimer.current = setTimeout(() => {
      if (runningRef.current === origin) update(origin, (s) => demoAdapter.ingestTurn(s));
    }, 1100);
    return () => {
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
  }, [running, states]);
  useEffect(() => {
    if (flow) {
      const timer = setTimeout(
        () =>
          flow.fitView({
            padding: 0.23,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300,
            maxZoom: 1,
          }),
        80,
      );
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [session, flow]);
  // Demo trace: one step at a time, always against the originating chat's current memory.
  function stepRun(origin: SessionId, keepPlaying: boolean) {
    const result = stepDemo(runs[origin], states[origin], sampleCodeAdapter, demoScope(origin));
    const script = demoScripts[origin];
    const applied = script[runs[origin].step];
    if (applied?.kind === "edit")
      setFeedback((f) => ({
        ...f,
        [origin]: {
          message: `Demo replay · ${applied.command} · previous version kept in history`,
          error: false,
        },
      }));
    if (result.memory !== states[origin]) update(origin, () => result.memory);
    setRuns((r) => ({ ...r, [origin]: { ...result.run, playing: keepPlaying && !result.done } }));
  }
  useEffect(() => {
    const origin = session;
    if (!runs[origin].playing) return;
    const timer = setTimeout(
      () => stepRun(origin, true),
      runs[origin].step === 0 ? 300 : DEMO_STEP_MS,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, session]);
  function playDemo() {
    if (runningRef.current) stopReplay();
    setView("dual");
    const fresh = run.step >= demoScripts[session].length;
    setRuns((r) => ({
      ...r,
      [session]: { ...(fresh ? newRun(session) : r[session]), playing: true },
    }));
  }
  function pauseDemo() {
    setRuns((r) => ({ ...r, [session]: { ...r[session], playing: false } }));
  }
  function replayDemo() {
    setRuns((r) => ({ ...r, [session]: newRun(session) }));
  }
  function choose(id: string) {
    update(session, (s) => ({ ...s, selectedId: id }));
    setInspector(true);
  }
  function stopReplay() {
    runningRef.current = null;
    setRunning(null);
    if (replayTimer.current) clearTimeout(replayTimer.current);
  }
  function play() {
    if (running === session) {
      stopReplay();
      return;
    }
    runningRef.current = session;
    setRunning(session);
    setFeed("turns");
  }
  function submit(input = inputs[session]) {
    if (!input.trim() || busy) return;
    const origin = session;
    setBusy(origin);
    setInputs((s) => ({ ...s, [origin]: "" }));
    setFeedback((f) => ({
      ...f,
      [origin]: {
        message: "Demo interpretation · applying to " + sessionNames[origin],
        error: false,
      },
    }));
    const timer = setTimeout(() => {
      setStates((previous) => {
        const result = demoAdapter.memoryCommand(previous[origin], input);
        setFeedback((f) => ({
          ...f,
          [origin]: { message: result.message, error: !result.supported },
        }));
        return { ...previous, [origin]: result.state };
      });
      timers.current.delete(origin);
      setBusy(null);
    }, 400);
    timers.current.set(origin, timer);
  }
  function reset(empty: boolean) {
    const origin = resetSession;
    if (!origin) return;
    if (runningRef.current === origin) stopReplay();
    const timer = timers.current.get(origin);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(origin);
      setBusy(null);
    }
    setStates((prev) => ({ ...prev, [origin]: initialState(origin, empty) }));
    setRuns((prev) => ({ ...prev, [origin]: newRun(origin) }));
    setFeedback((prev) => ({ ...prev, [origin]: undefined }));
    setQueries((prev) => ({ ...prev, [origin]: "" }));
    setInputs((prev) => ({ ...prev, [origin]: "" }));
    setResetSession(null);
  }
  function onNodesChange(changes: NodeChange<MemoryFlowNode>[]) {
    const dimensions = changes.filter((change) => change.type === "dimensions");
    if (dimensions.length) {
      setMeasurements((previous) => {
        const next = { ...previous };
        for (const change of dimensions) {
          if (change.dimensions) next[change.id] = change.dimensions;
        }
        return next;
      });
    }
    const moves = changes.filter((change) => change.type === "position");
    if (!moves.length) return;
    update(session, (s) => ({
      ...s,
      memories: s.memories.map((memory) => {
        const move = moves.find((change) => change.id === memory.id);
        return move?.position ? { ...memory, position: move.position } : memory;
      }),
    }));
  }
  const completed = state.replayIndex >= replayTurns[session].length;
  const memoryStage = (
    <div className="graph-stage">
      <div className="canvas-top">
        <div className="search-box">
          <Search size={13} />
          <input
            aria-label="Search memories"
            value={query}
            placeholder="Search this chat’s memories…"
            onChange={(e) => setQueries((prev) => ({ ...prev, [session]: e.target.value }))}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              aria-label="Clear search"
              onClick={() => setQueries((prev) => ({ ...prev, [session]: "" }))}
            >
              <X />
            </Button>
          )}
        </div>
        <div className="canvas-status">
          <span className="status-dot" />
          {persistError ? "Storage unavailable" : "Saved locally"}
          <Button
            variant="ghost"
            size="icon"
            title="Toggle inspector"
            aria-label="Toggle inspector"
            aria-pressed={inspector}
            onClick={() => setInspector(!inspector)}
          >
            <PanelRight />
          </Button>
        </div>
        {query && (
          <div className="search-results">
            {matches.length ? (
              matches.map((m) => (
                <Button
                  variant="ghost"
                  className="search-result"
                  key={m.id}
                  onClick={() => {
                    choose(m.id);
                    setQueries((prev) => ({ ...prev, [session]: "" }));
                    flow?.setCenter(m.position.x + 116, m.position.y + 60, {
                      zoom: 1,
                      duration: 250,
                    });
                  }}
                >
                  {m.content}
                </Button>
              ))
            ) : (
              <div className="search-empty">
                No matching active memories in {sessionNames[session]}.
              </div>
            )}
          </div>
        )}
      </div>
      <ReactFlow<MemoryFlowNode>
        key={session}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => choose(node.id)}
        onConnect={(connection) => {
          if (connection.source && connection.target)
            update(session, (s) => connect(s, connection.source, connection.target, "related to"));
        }}
        fitView
        fitViewOptions={{ padding: 0.23, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.6}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={23} size={1} />
        <Controls showInteractive={false} position="bottom-right" orientation="horizontal" />
        <MiniMap pannable zoomable ariaLabel="Memory graph minimap" />
      </ReactFlow>
      {!graph.memories.length && (
        <div className="empty-graph">
          <Network size={35} strokeWidth={1.2} />
          <h2>No memories yet</h2>
          <p>This chat is empty. Add a memory below or reset to the sample graph.</p>
        </div>
      )}
      {(running === session || completed || state.replayIndex > 0) && (
        <div className="replay-strip">
          {running === session ? (
            <LoaderCircle size={12} className="replay-pulse" />
          ) : (
            <History size={12} />
          )}
          <span>
            {running === session
              ? "Capturing next CLI exchange…"
              : completed
                ? "Replay complete"
                : "Replay paused"}{" "}
            · {state.replayIndex}/{replayTurns[session].length}
          </span>
          {running !== session && !completed && (
            <Button variant="ghost" size="sm" onClick={play}>
              <Play />
              Resume
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset selected chat"
            title="Reset selected chat"
            onClick={() => setResetSession(session)}
          >
            <RotateCcw />
          </Button>
        </div>
      )}
      <div className="canvas-bottom">
        {(["entity", "fact", "decision", "constraint", "task"] as const).map((type) => (
          <span className="legend-item" key={type}>
            <span className={`legend-dot legend-${type}`} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div className="workspace">
      <aside className="session-rail" aria-label="CLI sessions">
        <div className="brand">
          <Network size={24} strokeWidth={1.5} className="lens-logo" />
          <div>
            <div className="brand-name">code-review-graph</div>
            <div className="brand-sub">Agent memory</div>
          </div>
        </div>
        {modeSwitch}
        <div className="rail-section">
          <span className="rail-label">Conversations</span>
          <FolderGit2 size={12} className="text-muted-foreground" />
        </div>
        <nav className="session-list">
          {sessionIds.map((id) => (
            <Button
              key={id}
              variant="ghost"
              className={`session-button ${session === id ? "active" : ""}`}
              aria-pressed={session === id}
              onClick={() => {
                setRuns((r) => ({ ...r, [session]: { ...r[session], playing: false } }));
                setSession(id);
                setInspector(window.innerWidth >= 1100);
              }}
            >
              <FileCode2 size={16} />
              <div className="min-w-0">
                <div className="session-title">{sessionNames[id]}</div>
                <div className="session-sub">
                  {demoAdapter.getGraph(states[id]).memories.length} memories · CLI replay
                </div>
              </div>
              {session === id && <span className="session-marker" />}
            </Button>
          ))}
        </nav>
        <div className="rail-rule" />
        <nav className="rail-menu">
          <Button variant="ghost" className="rail-action" onClick={() => setDrawer("context")}>
            <Layers3 />
            Memory context<span>{graph.memories.length}</span>
          </Button>
          <Button
            variant="ghost"
            className="rail-action"
            onClick={() => setFeed(feed === "activity" ? null : "activity")}
          >
            <Activity />
            Activity<span>{state.activity.length}</span>
          </Button>
          <Button
            variant="ghost"
            className="rail-action"
            onClick={() => setFeed(feed === "turns" ? null : "turns")}
          >
            <Terminal />
            Captured CLI turns<span>{state.turns.length}</span>
          </Button>
        </nav>
        <div className="rail-bottom">
          <div className="connection-box">
            <div className="connection-title">
              <Unplug size={12} className="text-muted-foreground" />
              CLI not connected
            </div>
            <p>
              Replay adapter selected.
              <br />
              Your coding chat stays in your CLI.
            </p>
            <Button
              variant="outline"
              className="connect-button"
              onClick={() => setDrawer("connect")}
            >
              <Plus />
              Connect source
              <ArrowUpRight className="ml-auto" />
            </Button>
          </div>
          <div className="rail-footer">
            <div className="avatar">ML</div>
            <div>
              <strong>Hackathon workspace</strong>
              <small>GPT-6 Astra · London</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main-workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={11} />
            <strong className="truncate">{sessionNames[session]}</strong>
            <ChevronRight size={11} />
            <span className="hidden sm:inline">Memory graph</span>
            <span className="sm:hidden">CLI not connected</span>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">
              <span className="status-dot" />
              Demo replay
            </span>
            <span className="offline-label">
              <Unplug size={11} />
              CLI not connected
            </span>
            <Button
              variant="ghost"
              size="icon"
              title="Proposed CLI integration"
              aria-label="Connect source"
              onClick={() => setDrawer("connect")}
            >
              <CircleHelp />
            </Button>
          </div>
        </header>
        <section className="graph-heading">
          <div className="min-w-0">
            <h1>{sessionNames[session]}</h1>
            <p>
              <Network size={12} />
              {graph.memories.length} active memories<span>·</span>
              {graph.edges.length} relationships
            </p>
          </div>
          <div className="heading-actions">
            <ViewToggle view={view} onChange={setView} />
            <Button
              variant="outline"
              className="context-button"
              onClick={() => setDrawer("context")}
              title="Memory context"
            >
              <BookOpen />
              <span>Memory context</span>
            </Button>
            <Button
              className="replay-button"
              onClick={completed ? () => setResetSession(session) : play}
              disabled={!ready}
            >
              {running === session ? <Square /> : completed ? <RotateCcw /> : <Play />}
              {running === session
                ? "Stop replay"
                : completed
                  ? "Replay again"
                  : "Replay CLI turns"}
            </Button>
          </div>
        </section>
        <section className="graph-area" aria-label="Memory graph">
          {view === "dual" ? (
            <TwoGraphStage
              memoryCanvas={memoryStage}
              memoryScope={`${sessionNames[session]} · ${memoryRevision(state)}`}
              trace={run.trace}
              codeGraph={codeGraph}
              codeStatus={sampleCodeAdapter.status()}
              reducedMotion={reducedMotion}
              staleCapsule={
                !!run.trace?.capsule && run.trace.capsule.revision !== memoryRevision(state)
              }
              controls={
                <div className="demo-controls" role="group" aria-label="Demo replay controls">
                  <span className="replay-tag">Sample replay</span>
                  {run.playing ? (
                    <Button size="sm" variant="outline" onClick={pauseDemo}>
                      <Pause />
                      Pause
                    </Button>
                  ) : (
                    <Button size="sm" onClick={playDemo} disabled={!ready}>
                      <Play />
                      {run.step === 0 || run.step >= demoScripts[session].length
                        ? "Play the 60-second demo"
                        : "Resume demo"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => stepRun(session, false)}
                    disabled={!ready || run.playing || run.step >= demoScripts[session].length}
                  >
                    <SkipForward />
                    Step
                  </Button>
                  <Button size="sm" variant="ghost" onClick={replayDemo} disabled={run.step === 0}>
                    <RotateCcw />
                    Replay
                  </Button>
                  <span className="demo-caption" role="status">
                    {run.step
                      ? `${run.step}/${demoScripts[session].length} · ${demoScripts[session][run.step - 1]?.caption}`
                      : "Coding prompts come from captured sample CLI turns"}
                  </span>
                </div>
              }
            />
          ) : (
            memoryStage
          )}
          {inspector && (
            <MemoryInspector
              key={`${session}:${state.selectedId}`}
              memory={selected}
              state={state}
              onUpdate={(apply) => update(session, apply)}
              onClose={() => setInspector(false)}
              onSource={() => setFeed("turns")}
            />
          )}
        </section>
        {feed && (
          <section className="activity-panel" aria-label="External CLI evidence">
            <div className="activity-toolbar">
              <Button
                variant="ghost"
                className={feed === "turns" ? "tab-active" : ""}
                onClick={() => setFeed("turns")}
              >
                <Terminal />
                Captured CLI turns
              </Button>
              <Button
                variant="ghost"
                className={feed === "activity" ? "tab-active" : ""}
                onClick={() => setFeed("activity")}
              >
                <Activity />
                Memory activity
              </Button>
              <span className="activity-title">
                {feed === "turns" ? "Read-only · demo evidence" : sessionNames[session]}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close activity feed"
                onClick={() => setFeed(null)}
              >
                <X />
              </Button>
            </div>
            <div className="activity-scroll">
              {feed === "turns" ? (
                state.turns.length ? (
                  [...state.turns].reverse().map((turn) => (
                    <div className="turn" key={turn.id}>
                      <span className="turn-role">you</span>
                      <div>{turn.user}</div>
                      {turn.agent && (
                        <>
                          <span className="turn-role agent">work</span>
                          <div className="turn-work">
                            {turn.agent}
                            <small> · assistant output, not used for memory</small>
                          </div>
                        </>
                      )}
                      <div className="turn-affected">
                        <span>
                          {displayTime(turn.time)} ·{" "}
                          {turn.affected.length ? "Affected:" : "No relevant memories"}
                        </span>
                        {turn.affected.map((id) => (
                          <Button key={id} variant="secondary" size="sm" onClick={() => choose(id)}>
                            {state.memories.find((m) => m.id === id)?.content ?? id}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No captured turns in this chat.</p>
                )
              ) : state.activity.length ? (
                state.activity.map((entry) => (
                  <div className="activity-entry" key={entry.id}>
                    <time>{displayTime(entry.time)}</time>
                    <div>
                      {entry.text}
                      {entry.affected.length > 0 && (
                        <div className="turn-affected">
                          {entry.affected.map((id) => (
                            <Button key={id} variant="ghost" size="sm" onClick={() => choose(id)}>
                              {state.memories.find((m) => m.id === id)?.content ?? id}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No memory activity yet.</p>
              )}
            </div>
          </section>
        )}
        <section className="command-section">
          <div className="command-label-row">
            <label className="command-label" htmlFor="memory-command">
              <Command size={13} />
              Tell memory what to remember
            </label>
            <span className="demo-interpretation">
              <span className="status-dot" />
              Demo interpretation
            </span>
          </div>
          <form
            className="command-input-wrap"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              id="memory-command"
              value={inputs[session]}
              placeholder="Add a fact, connect an idea, or correct a memory…"
              onChange={(e) => setInputs((prev) => ({ ...prev, [session]: e.target.value }))}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!ready || !!busy || !inputs[session].trim()}
              aria-label="Apply memory command"
              title="Apply memory command"
            >
              {busy === session ? <LoaderCircle /> : <ArrowUp />}
            </Button>
          </form>
          <div className="command-chips">
            {demoCommands.map((command, i) => (
              <Button
                key={command}
                variant="ghost"
                className="command-chip"
                onClick={() => setInputs((prev) => ({ ...prev, [session]: command }))}
              >
                {i === 0 ? <Plus /> : i === 1 ? <GitBranch /> : i === 2 ? <RotateCcw /> : <X />}
                {command}
              </Button>
            ))}
          </div>
          {feedback[session] && (
            <div
              role="status"
              className={`command-feedback ${feedback[session]?.error ? "is-error" : ""}`}
            >
              {feedback[session]?.message}
            </div>
          )}
        </section>
        <footer className="workspace-footer">
          <span>
            <Terminal size={11} />
            <Button
              variant="link"
              className="h-auto p-0 text-[9px] text-muted-foreground"
              onClick={() => setFeed(feed ? null : "turns")}
            >
              {feed ? "Hide captured turns" : "Show captured CLI turns"}
            </Button>
            <span>·</span>
            <Button
              variant="link"
              className="h-auto p-0 text-[9px] text-muted-foreground"
              onClick={() => setResetSession(session)}
            >
              Reset chat
            </Button>
          </span>
          <span>
            GPT-6 Astra Hackathon London<span>·</span>Visual prototype
          </span>
        </footer>
      </main>
      <MemoryDrawers drawer={drawer} onClose={() => setDrawer(null)} state={state} />
      <Dialog
        open={resetSession !== null}
        onOpenChange={(open) => {
          if (!open) setResetSession(null);
        }}
      >
        <DialogContent className="confirm-dialog">
          <DialogTitle>Reset {resetSession ? sessionNames[resetSession] : "chat"}?</DialogTitle>
          <DialogDescription className="confirm-description">
            Reset only this chat’s memories, positions, history and replay progress. The other CLI
            chat will stay unchanged. You can restore the sample graph or start empty.
          </DialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetSession(null)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => reset(true)}>
              Start empty
            </Button>
            <Button onClick={() => reset(false)}>
              <RotateCcw />
              Reset demo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: "demo" | "live";
  onChange: (mode: "demo" | "live") => void;
}) {
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Memory source mode">
      {(["demo", "live"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? "active" : ""}
          onClick={() => onChange(m)}
        >
          {m === "demo" ? "Demo replay" : "Live service"}
        </button>
      ))}
    </div>
  );
}
export function MemoryLens() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />;
  return (
    <ReactFlowProvider>
      {mode === "demo" ? (
        <MemoryWorkspace modeSwitch={modeSwitch} />
      ) : (
        <LiveWorkspace modeSwitch={modeSwitch} />
      )}
    </ReactFlowProvider>
  );
}

