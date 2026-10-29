import LazyMarkdown from '../../../components/markdown/LazyMarkdown';
import CopyButton from '../../../components/ui/CopyButton';
import { partitionMessage, type ChatMessage } from '../lib/conversation';
import WorkProcess from './WorkProcess';

export default function AssistantMessage({
  message,
  active,
}: {
  message: ChatMessage;
  active: boolean;
}) {
  const { work, answer } = partitionMessage(message, active);

  return (
    <>
      <div className="space-y-3">
        {(active || work.length > 0) && (
          <WorkProcess
            blocks={work}
            active={active}
            stopped={message.stopped}
          />
        )}
        {answer.map((block, index) => (
          <LazyMarkdown key={index} text={block.text} />
        ))}
      </div>
      {answer.length > 0 && (
        <div className="mt-2 -ml-1.5">
          <CopyButton
            label="Copy response"
            text={answer.map((block) => block.text).join('\n\n')}
          />
        </div>
      )}
    </>
  );
}
