import useChat from './useChat';
import type { SessionLibrary } from './useSessionLibrary';
const replyToEveryMessage = () => true;
export default function useConversation(library: SessionLibrary) {
  return useChat(library, 'chat', replyToEveryMessage);
}
