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
      setSessions(
        sorted(sessions.filter((session) => !deleted.current.has(session.id))),
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
    void refresh();
    return () => {
      version.current++;
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
      sorted([session, ...items.filter((item) => item.id !== session.id)]),
    );
  }, []);

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
    upsert(await agent.renameSession(id, title));
  }
  async function deleteSession(id: string, cleanup: boolean) {
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
