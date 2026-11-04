import useChat from '../../home/hooks/useChat';
import type { SessionLibrary } from '../../home/hooks/useSessionLibrary';
import { mentionsModel } from '../lib/mention';
export default function useFreeChat(library: SessionLibrary) {
  return useChat(library, 'freechat', mentionsModel);
}
