import useChat from './useChat';
import type { SessionLibrary } from './useSessionLibrary';
import type { ModelSelection } from '../../../../shared/agent/types';
const replyToEveryMessage = () => true;
export default function useConversation(
  library: SessionLibrary,
  selection: ModelSelection | null,
) {
  return useChat(library, 'chat', replyToEveryMessage, selection);
}
