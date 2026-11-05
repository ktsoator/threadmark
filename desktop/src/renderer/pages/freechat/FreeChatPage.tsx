import Button from '../../components/ui/Button';
import MessageList from '../home/components/MessageList';
import FreeChatComposer from './components/FreeChatComposer';
import MentionText from './components/MentionText';
import type useFreeChat from './hooks/useFreeChat';
import type useModels from '../home/hooks/useModels';

export default function FreeChatPage({
  chat,
  models,
}: {
  chat: ReturnType<typeof useFreeChat>;
  models: ReturnType<typeof useModels>;
}) {
  return (
    <>
      {chat.messages.length || chat.loading ? (
        <MessageList
          key={chat.activeId ?? 'new'}
          messages={chat.messages}
          busy={chat.generating}
          loading={chat.loading}
          renderUserMessage={(text) => <MentionText text={text} />}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
          <div className="max-w-composer text-center">
            <h1 className="text-title-small font-medium tracking-tight">
              Room to think
            </h1>
            <p className="mt-3 text-message text-muted-foreground">
              Write down an idea, a question, or something you learned.
              <br />
              Type @ to choose a model whenever you want a hand.
            </p>
          </div>
        </div>
      )}
      <div className="shrink-0 bg-background px-4 pt-2 pb-3 desktop:px-8">
        <div className="mx-auto max-w-reading">
          <FreeChatComposer
            key={chat.activeId ?? 'new'}
            value={chat.draft}
            onChange={chat.setDraft}
            onSubmit={() => {
              void chat.send();
            }}
            onStop={chat.stop}
            busy={chat.generating}
            disabled={!chat.ready || chat.saving}
            models={models}
          />
          <div
            className="min-h-6 px-3 pt-1.5 text-caption text-error [overflow-wrap:anywhere]"
            role="alert"
          >
            {chat.error}
            {!chat.loading &&
              !chat.saving &&
              !chat.generating &&
              chat.error && (
                <Button
                  className="ml-2 h-auto p-0 text-caption text-error underline"
                  onClick={chat.retry}
                >
                  Reload history
                </Button>
              )}
          </div>
        </div>
      </div>
    </>
  );
}
