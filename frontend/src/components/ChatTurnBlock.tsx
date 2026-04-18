import { memo } from "react";
import { humanizeChatError, type ChatTurn } from "../lib/session";
import { AlertCircleIcon } from "./icons";

type ChatTurnBlockProps = {
  turn: ChatTurn;
  copyId: string | null;
  onCopyAnswer: (turnId: string, text: string) => void;
  onRetryErrorTurn?: (turnId: string, query: string) => void;
  askLoading?: boolean;
};

function ChatTurnBlockInner({
  turn,
  copyId,
  onCopyAnswer,
  onRetryErrorTurn,
  askLoading,
}: ChatTurnBlockProps) {
  const errorCopy =
    turn.status === "error" ? humanizeChatError(turn.message) : null;

  return (
    <article className="chat__turn">
      <div className="msg msg--user">
        <div className="msg__bubble msg__bubble--user">{turn.query}</div>
      </div>
      <div className="msg msg--assistant">
        {turn.status === "pending" ? (
          <div
            className="msg__bubble msg__bubble--assistant msg__bubble--loading"
            aria-busy="true"
            aria-label="Assistant is thinking"
          >
            <span className="msg__loading-dot" />
            <span className="msg__loading-dot" />
            <span className="msg__loading-dot" />
          </div>
        ) : null}
        {turn.status === "error" ? (
          <div className="msg__error" role="alert">
            <div className="msg__error-inner">
              <span className="msg__error-icon" aria-hidden>
                <AlertCircleIcon />
              </span>
                           <div className="msg__error-body">
                {errorCopy ? (
                  <>
                    <p className="msg__error-title">{errorCopy.title}</p>
                    {errorCopy.detail && errorCopy.detail !== errorCopy.title ? (
                      <p className="msg__error-detail">{errorCopy.detail}</p>
                    ) : null}
                  </>
                ) : null}
                {onRetryErrorTurn ? (
                  <div className="msg__error-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm msg__error-retry"
                      disabled={askLoading}
                      onClick={() => onRetryErrorTurn(turn.id, turn.query)}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {turn.status === "done" ? (
          <>
            <div className="msg__bubble msg__bubble--assistant">
              <p className="msg__answer">{turn.answer}</p>
              <div className="msg__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => onCopyAnswer(turn.id, turn.answer)}
                >
                  {copyId === turn.id ? "Copied" : "Copy answer"}
                </button>
              </div>
            </div>
            {turn.sources.length > 0 ? (
              <details className="sources-details">
                <summary className="sources-details__summary">
                  Sources ({turn.sources.length})
                </summary>
                <div className="sources-details__list">
                  {turn.sources.map((source, index) => (
                    <div
                      className="source-card"
                      key={`${source.doc_id}-${source.chunk_id}-${index}`}
                    >
                      <p className="source-card__meta">
                        Doc {source.doc_id} · Chunk {source.chunk_id}
                      </p>
                      <p className="source-card__text">{source.text}</p>
                      {source.distance !== undefined ? (
                        <p className="source-card__score">
                          Distance:{" "}
                          {typeof source.distance === "number"
                            ? source.distance.toFixed(4)
                            : source.distance}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

export const ChatTurnBlock = memo(ChatTurnBlockInner);
