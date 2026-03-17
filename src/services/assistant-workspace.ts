import type {
  AssistantConversationThread,
  AssistantDomainMode,
  AssistantMemoryNote,
  AssistantSavedWorkflow,
} from '@/platform/ai/assistant-contracts';
import type { AiTaskClass } from '@/platform/ai/contracts';
import type { KnowledgeDocument } from '@/platform/retrieval/contracts';
import { createAssistantSessionContext, normalizeAssistantSessionContext } from '@/services/ai-orchestrator/session';

const STORAGE_KEY = 'qadr110-assistant-workspace';
export const ASSISTANT_WORKSPACE_EVENT = 'qadr110:assistant-workspace-changed';

export interface AssistantWorkspaceState {
  activeThreadId: string | null;
  threads: AssistantConversationThread[];
  workflows: AssistantSavedWorkflow[];
  memoryNotes: AssistantMemoryNote[];
  knowledgeDocuments: KnowledgeDocument[];
  compactMode: boolean;
}

const DEFAULT_STATE: AssistantWorkspaceState = {
  activeThreadId: null,
  threads: [],
  workflows: [],
  memoryNotes: [],
  knowledgeDocuments: [],
  compactMode: false,
};

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(state: AssistantWorkspaceState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AssistantWorkspaceState>(ASSISTANT_WORKSPACE_EVENT, {
      detail: state,
    }));
  }
}

export function loadAssistantWorkspaceState(): AssistantWorkspaceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<AssistantWorkspaceState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      threads: Array.isArray(parsed.threads)
        ? parsed.threads.map((thread) => ({
          ...thread,
          sessionContext: normalizeAssistantSessionContext(thread.sessionContext, thread.id),
        }))
        : [],
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
      memoryNotes: Array.isArray(parsed.memoryNotes) ? parsed.memoryNotes : [],
      knowledgeDocuments: Array.isArray(parsed.knowledgeDocuments) ? parsed.knowledgeDocuments : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveAssistantWorkspaceState(state: AssistantWorkspaceState): void {
  persist(state);
}

export function createAssistantThread(
  domainMode: AssistantDomainMode,
  taskClass: AiTaskClass,
  title = 'گفت‌وگوی جدید',
): AssistantConversationThread {
  const now = new Date().toISOString();
  return {
    id: createId('thread'),
    title,
    domainMode,
    taskClass,
    createdAt: now,
    updatedAt: now,
    messages: [],
    pinnedEvidenceIds: [],
    sessionContext: createAssistantSessionContext(),
  };
}

export function upsertAssistantThread(state: AssistantWorkspaceState, thread: AssistantConversationThread): AssistantWorkspaceState {
  const normalizedThread = {
    ...thread,
    sessionContext: normalizeAssistantSessionContext(thread.sessionContext, thread.id),
  };
  const nextThreads = [...state.threads];
  const index = nextThreads.findIndex((candidate) => candidate.id === normalizedThread.id);
  if (index >= 0) {
    nextThreads[index] = normalizedThread;
  } else {
    nextThreads.unshift(normalizedThread);
  }
  const nextState = {
    ...state,
    threads: nextThreads.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    activeThreadId: normalizedThread.id,
  };
  persist(nextState);
  return nextState;
}

export function removeAssistantThread(state: AssistantWorkspaceState, threadId: string): AssistantWorkspaceState {
  const threads = state.threads.filter((thread) => thread.id !== threadId);
  const nextState = {
    ...state,
    threads,
    activeThreadId: state.activeThreadId === threadId ? (threads[0]?.id ?? null) : state.activeThreadId,
  };
  persist(nextState);
  return nextState;
}

export function setActiveAssistantThread(state: AssistantWorkspaceState, threadId: string | null): AssistantWorkspaceState {
  const nextState = { ...state, activeThreadId: threadId };
  persist(nextState);
  return nextState;
}

export function upsertAssistantWorkflow(state: AssistantWorkspaceState, workflow: AssistantSavedWorkflow): AssistantWorkspaceState {
  const workflows = [...state.workflows];
  const index = workflows.findIndex((candidate) => candidate.id === workflow.id);
  if (index >= 0) {
    workflows[index] = workflow;
  } else {
    workflows.unshift(workflow);
  }
  const nextState = { ...state, workflows };
  persist(nextState);
  return nextState;
}

export function createWorkflowFromContext(params: {
  name: string;
  description: string;
  promptId: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  promptOverride?: string;
}): AssistantSavedWorkflow {
  const now = new Date().toISOString();
  return {
    id: createId('workflow'),
    createdAt: now,
    updatedAt: now,
    ...params,
  };
}

export function upsertAssistantMemoryNote(state: AssistantWorkspaceState, note: AssistantMemoryNote): AssistantWorkspaceState {
  const notes = [...state.memoryNotes];
  const index = notes.findIndex((candidate) => candidate.id === note.id);
  if (index >= 0) {
    notes[index] = note;
  } else {
    notes.unshift(note);
  }
  const nextState = { ...state, memoryNotes: notes };
  persist(nextState);
  return nextState;
}

export function createAssistantMemoryNote(title: string, content: string, tags: string[] = []): AssistantMemoryNote {
  const now = new Date().toISOString();
  return {
    id: createId('memory'),
    title,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertKnowledgeDocument(state: AssistantWorkspaceState, document: KnowledgeDocument): AssistantWorkspaceState {
  const docs = [...state.knowledgeDocuments];
  const index = docs.findIndex((candidate) => candidate.id === document.id);
  if (index >= 0) {
    docs[index] = document;
  } else {
    docs.unshift(document);
  }
  const nextState = { ...state, knowledgeDocuments: docs };
  persist(nextState);
  return nextState;
}

export function setAssistantCompactMode(state: AssistantWorkspaceState, compactMode: boolean): AssistantWorkspaceState {
  const nextState = { ...state, compactMode };
  persist(nextState);
  return nextState;
}

export function subscribeAssistantWorkspaceChange(
  listener: (state: AssistantWorkspaceState) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AssistantWorkspaceState>).detail;
    listener(detail ?? loadAssistantWorkspaceState());
  };
  window.addEventListener(ASSISTANT_WORKSPACE_EVENT, handler as EventListener);
  return () => window.removeEventListener(ASSISTANT_WORKSPACE_EVENT, handler as EventListener);
}
