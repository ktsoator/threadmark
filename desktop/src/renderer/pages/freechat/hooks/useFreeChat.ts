import useChat from '../../home/hooks/useChat';
import type { SessionLibrary } from '../../home/hooks/useSessionLibrary';
import {
  mentionLabelText,
  mentionsModel,
  resolveMentionModel,
} from '../lib/mention';
import type { ModelList } from '../../../../shared/agent/types';
export default function useFreeChat(
  library: SessionLibrary,
  catalog: ModelList | null,
) {
  return useChat(
    library,
    'freechat',
    mentionsModel,
    (text) => resolveMentionModel(text, catalog),
    mentionLabelText,
  );
}
