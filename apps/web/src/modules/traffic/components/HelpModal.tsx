import { useMemo, useState } from 'react';
import { HelpTopicId, helpTopics, helpTopicsById } from '../help/helpContent';
import './HelpModal.css';

interface HelpModalProps {
  activeTopicId: HelpTopicId;
  onClose: () => void;
  onSelectTopic: (topicId: HelpTopicId) => void;
}

function topicMatchesQuery(topic: (typeof helpTopics)[number], query: string) {
  if (!query) return true;
  const haystack = [
    topic.title,
    topic.summary,
    ...topic.tags,
    ...topic.sections.flatMap((section) => [section.heading, section.body]),
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

export function HelpModal({ activeTopicId, onClose, onSelectTopic }: HelpModalProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTopics = useMemo(() => (
    helpTopics.filter((topic) => topicMatchesQuery(topic, normalizedQuery))
  ), [normalizedQuery]);
  const activeTopic = helpTopicsById.get(activeTopicId) || helpTopics[0];

  return (
    <div className="traffic-help-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="traffic-help-title"
        aria-modal="true"
        className="traffic-help-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="traffic-help-header">
          <div>
            <span>Contextual help</span>
            <h2 id="traffic-help-title">{activeTopic.title}</h2>
          </div>
          <button className="traffic-icon-button" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="traffic-help-search">
          <label>
            Search help
            <input
              autoFocus
              placeholder="e.g. allocation, risks, bench"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="traffic-help-layout">
          <nav className="traffic-help-nav" aria-label="Help topics">
            {filteredTopics.map((topic) => (
              <button
                className={`traffic-help-topic ${topic.id === activeTopic.id ? 'is-active' : ''}`}
                key={topic.id}
                type="button"
                onClick={() => onSelectTopic(topic.id)}
              >
                <strong>{topic.title}</strong>
                <span>{topic.summary}</span>
              </button>
            ))}
            {!filteredTopics.length ? (
              <div className="traffic-help-empty">No topics match this search.</div>
            ) : null}
          </nav>

          <article className="traffic-help-content">
            <p className="traffic-help-summary">{activeTopic.summary}</p>
            {activeTopic.sections.map((section) => (
              <section className="traffic-help-section" key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </article>
        </div>
      </section>
    </div>
  );
}
