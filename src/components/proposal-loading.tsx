"use client";

const bar = (className: string, key?: number) => (
  <span className={`loading-bar ${className}`} key={key} />
);

/** Placeholder shaped like the proposal editor while it loads. */
export function EditorLoading() {
  return (
    <div
      className="quote-workspace editor-v2 editor-loading"
      role="status"
      aria-label="Loading the editor"
    >
      <span className="sr-only">Loading the editor…</span>
      <div className="editor-loading-header" aria-hidden="true">
        {bar("on-chrome loading-back")}
        {bar("on-chrome loading-title")}
        <span className="loading-spacer" />
        {bar("on-chrome loading-pill")}
        {bar("on-chrome loading-pill")}
        {bar("on-chrome loading-pill loading-pill-primary")}
      </div>
      <div className="editor-loading-body" aria-hidden="true">
        <div className="editor-loading-rail">
          {bar("loading-label")}
          {bar("loading-row")}
          {bar("loading-row")}
          {bar("loading-label")}
          {bar("loading-row")}
        </div>
        <div className="editor-loading-canvas">
          <div className="editor-loading-sheet">
            {bar("loading-eyebrow")}
            {bar("loading-heading")}
            {bar("loading-heading loading-short")}
            {bar("loading-text loading-mid")}
            {bar("loading-subheading")}
            {[0, 1, 2].map((n) => bar("loading-text", n))}
            {bar("loading-text loading-mid")}
          </div>
        </div>
        <div className="editor-loading-panel">
          {bar("loading-tabs")}
          <div className="loading-card">{bar("loading-text")}</div>
          <div className="loading-card">{bar("loading-text")}</div>
          <div className="loading-card loading-card-dark">
            {bar("on-chrome loading-text loading-short")}
            {bar("on-chrome loading-text")}
          </div>
        </div>
      </div>
      <div className="editor-loading-dock" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((n) => bar("loading-dock-item", n))}
      </div>
    </div>
  );
}

/** Placeholder shaped like the proposal details page while it loads. */
export function DetailsLoading() {
  return (
    <div
      className="details-loading"
      role="status"
      aria-label="Loading the proposal"
    >
      <span className="sr-only">Loading the proposal…</span>
      <div className="details-loading-top" aria-hidden="true">
        {bar("loading-back")}
        <span className="loading-spacer" />
        {bar("loading-pill")}
        {bar("loading-pill")}
      </div>
      <div className="details-loading-hero" aria-hidden="true">
        {bar("on-chrome loading-eyebrow")}
        <div className="details-loading-hero-row">
          {bar("on-chrome loading-heading")}
          {bar("on-chrome loading-amount")}
        </div>
        {bar("on-chrome loading-text loading-short")}
        {bar("on-chrome loading-progress")}
        {bar("on-chrome loading-text loading-mid")}
      </div>
      <div className="details-loading-section" aria-hidden="true">
        {bar("loading-subheading")}
        <div className="loading-card details-loading-pair">
          {bar("loading-text")}
          {bar("loading-text")}
        </div>
      </div>
      <div className="details-loading-columns" aria-hidden="true">
        <div className="details-loading-section">
          {bar("loading-subheading")}
          <div className="loading-card">
            {bar("loading-text")}
            {bar("loading-text loading-mid")}
            {bar("loading-text")}
          </div>
        </div>
        <div className="details-loading-section">
          {bar("loading-subheading")}
          <div className="loading-card">
            {bar("loading-text loading-mid")}
            {bar("loading-text")}
          </div>
        </div>
      </div>
    </div>
  );
}
