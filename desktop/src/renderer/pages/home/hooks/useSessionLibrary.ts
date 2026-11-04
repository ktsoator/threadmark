import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentSession,
  ChatKind,
  CreateProjectOptions,
  CreateSessionOptions,
  Project,
} from '../../../../shared/agent/types';
import * as agent from '../../../services/agent';

export type ChatTarget = {
  sessionId: string | null;
  projectId: string | null;
  kind: ChatKind;
};
export type Selection = { page: 'chat' | 'skills'; target: ChatTarget };
const storageKey = 'threadmark.navigation.v1';
const emptyTarget = (): ChatTarget => ({
  sessionId: null,
  projectId: null,
  kind: 'chat',
});
export const sessionKind = (session: AgentSession): ChatKind =>
  session.state.__session_metadata__?.kind === 'freechat' ? 'freechat' : 'chat';
const targetFor = (session: AgentSession): ChatTarget => ({
  sessionId: session.id,
  projectId: session.projectId,
  kind: sessionKind(session),
});
const sorted = (sessions: AgentSession[]) =>
  [...sessions].sort(
    (a, b) => b.lastUpdateTime - a.lastUpdateTime || a.id.localeCompare(b.id),
  );

// History responses may arrive before a title save finishes. Keep the title already displayed.
function withLocalTitle(session: AgentSession, current?: AgentSession) {
  if (
    current?.title &&
    (!session.title ||
      session.titleSource === 'none' ||
      (current.titleSource === 'manual' && session.titleSource !== 'manual'))
  )
    return {
      ...session,
      title: current.title,
      titleSource: current.titleSource,
    };
  return session;
}

function restoredSelection(
  sessions: AgentSession[],
  projects: Project[],
): Selection {
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    ) as Selection | null;
    if (saved?.target) {
      const session = sessions.find(
        (item) => item.id === saved.target.sessionId,
      );
      return {
        page: saved.page === 'skills' ? 'skills' : 'chat',
        target: session
          ? targetFor(session)
          : {
              sessionId: null,
              projectId: projects.some(
                (item) => item.id === saved.target.projectId,
              )
                ? saved.target.projectId
                : null,
              kind: saved.target.kind === 'freechat' ? 'freechat' : 'chat',
            },
      };
    }
  } catch {
    /* Invalid saved navigation falls back to the previous version. */
  }
  const page = localStorage.getItem('threadmark.active-page');
  const id = localStorage.getItem(
    page === 'freechat'
      ? 'threadmark.active-freechat-session'
      : 'threadmark.active-session',
  );
  const session = sessions.find((item) => item.id === id);
  return {
    page: page === 'skills' ? 'skills' : 'chat',
    target: session
      ? targetFor(session)
      : { ...emptyTarget(), kind: page === 'freechat' ? 'freechat' : 'chat' },
  };
}

export default function useSessionLibrary() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selection, setSelection] = useState<Selection>({
    page: 'chat',
    target: emptyTarget(),
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem('threadmark.expanded-projects') ?? '[]',
      );
      return Array.isArray(saved)
        ? saved.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const currentSelection = useRef(selection);
  const version = useRef(0);
  const restored = useRef(false);
  const deleted = useRef(new Set<string>());
  const titleRequests = useRef(new Map<string, object>());

  const navigate = useCallback((next: Selection) => {
    restored.current = true;
    currentSelection.current = next;
    setSelection(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (next.target.projectId)
      setExpanded((ids) =>
        ids.includes(next.target.projectId!)
          ? ids
          : [...ids, next.target.projectId!],
      );
  }, []);

  const refresh = useCallback(async () => {
    const token = ++version.current;
    try {
      const [projects, sessions] = await Promise.all([
        agent.listProjects(),
        agent.listSessions(),
      ]);
      if (token !== version.current) return;
      setProjects(projects);
      setSessions((current) =>
        sorted(
          sessions
            .filter((session) => !deleted.current.has(session.id))
            .map((session) =>
              withLocalTitle(
                session,
                current.find((item) => item.id === session.id),
              ),
            ),
        ),
      );
      setReady(true);
      setError('');
      if (!restored.current) {
        navigate(restoredSelection(sessions, projects));
      } else {
        const current = currentSelection.current;
        const sessionMissing =
          current.target.sessionId &&
          !sessions.some((item) => item.id === current.target.sessionId);
        const projectMissing =
          current.target.projectId &&
          !projects.some((item) => item.id === current.target.projectId);
        if (sessionMissing || projectMissing)
          navigate({
            page: 'chat',
            target: {
              ...current.target,
              sessionId: null,
              projectId: projectMissing ? null : current.target.projectId,
            },
          });
      }
    } catch (error) {
      if (token === version.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Could not load conversations.',
        );
    }
  }, [navigate]);

  useEffect(() => {
    const pendingTitles = titleRequests.current;
    void refresh();
    return () => {
      version.current++;
      pendingTitles.clear();
    };
  }, [refresh]);
  useEffect(() => {
    localStorage.setItem(
      'threadmark.expanded-projects',
      JSON.stringify(expanded),
    );
  }, [expanded]);

  const upsert = useCallback((session: AgentSession) => {
    if (deleted.current.has(session.id)) return;
    version.current++;
    setSessions((items) =>
      sorted([
        withLocalTitle(
          session,
          items.find((item) => item.id === session.id),
        ),
        ...items.filter((item) => item.id !== session.id),
      ]),
    );
  }, []);

  const updateTitle = useCallback(
    (id: string, title: string, titleSource: AgentSession['titleSource']) => {
      if (deleted.current.has(id)) return;
      version.current++;
      setSessions((items) =>
        items.map((item) =>
          item.id === id ? { ...item, title, titleSource } : item,
        ),
      );
    },
    [],
  );

  function selectSession(id: string) {
    const session = sessions.find((item) => item.id === id);
    if (session) navigate({ page: 'chat', target: targetFor(session) });
  }
  function newChat(projectId: string | null = null, kind: ChatKind = 'chat') {
    navigate({ page: 'chat', target: { sessionId: null, projectId, kind } });
  }
  async function createSession(options: CreateSessionOptions) {
    const session = await agent.createSession(options);
    upsert(session);
    return session;
  }
  function adoptCreated(session: AgentSession, expected: Selection) {
    if (currentSelection.current === expected)
      navigate({ page: 'chat', target: targetFor(session) });
  }
  async function renameSession(id: string, title: string) {
    // Invalidate an automatic title as soon as the user starts saving their own name.
    titleRequests.current.set(id, {});
    const session = await agent.renameSession(id, title);
    updateTitle(id, session.title, session.titleSource);
  }
  async function generateTitle(id: string, text: string) {
    if (
      titleRequests.current.has(id) ||
      deleted.current.has(id) ||
      sessions.some((item) => item.id === id && item.titleSource !== 'none')
    )
      return;
    const token = {};
    titleRequests.current.set(id, token);
    const isCurrent = () =>
      titleRequests.current.get(id) === token && !deleted.current.has(id);
    let title: string;
    try {
      title = await agent.generateTitle(text);
    } catch {
      // Keep the first-message title if generation fails; the conversation continues normally.
      return;
    }
    if (!isCurrent()) return;
    updateTitle(id, title, 'generated');
    try {
      const session = await agent.renameSession(id, title, 'generated');
      if (isCurrent()) updateTitle(id, session.title, session.titleSource);
    } catch {
      if (isCurrent())
        setNotice(
          'Could not save the conversation title. Rename it to save a name.',
        );
    }
  }
  async function deleteSession(id: string, cleanup: boolean) {
    titleRequests.current.delete(id);
    const result = await agent.deleteSession(id, cleanup);
    deleted.current.add(id);
    version.current++;
    setSessions((items) => items.filter((item) => item.id !== id));
    if (currentSelection.current.target.sessionId === id) {
      navigate({
        page: 'chat',
        target: { ...currentSelection.current.target, sessionId: null },
      });
    }
    if (result.warning) setNotice(result.warning);
  }
  async function createProject(options: CreateProjectOptions) {
    const project = await agent.createProject(options);
    version.current++;
    setProjects((items) => [...items, project]);
    newChat(project.id);
    return project;
  }
  async function renameProject(id: string, name: string) {
    const project = await agent.renameProject(id, name);
    version.current++;
    setProjects((items) =>
      items.map((item) => (item.id === id ? project : item)),
    );
  }
  async function deleteProject(id: string) {
    await agent.deleteProject(id);
    version.current++;
    setProjects((items) => items.filter((item) => item.id !== id));
    setExpanded((items) => items.filter((item) => item !== id));
    if (currentSelection.current.target.projectId === id) newChat();
  }
  const activeSession = sessions.find(
    (item) => item.id === selection.target.sessionId,
  );
  const target = activeSession ? targetFor(activeSession) : selection.target;
  return {
    sessions,
    projects,
    selection,
    target,
    activeSession,
    ready,
    error,
    notice,
    setNotice,
    expanded,
    refresh,
    upsert,
    newChat,
    selectSession,
    createSession,
    adoptCreated,
    renameSession,
    generateTitle,
    deleteSession,
    createProject,
    renameProject,
    deleteProject,
    showSkills: () => navigate({ ...currentSelection.current, page: 'skills' }),
    toggleProject: (id: string) =>
      setExpanded((ids) =>
        ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
      ),
  };
}
export type SessionLibrary = ReturnType<typeof useSessionLibrary>;
