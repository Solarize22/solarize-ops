"use client";

export default function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions = null,
  aside = null,
  children = null,
}) {
  return (
    <section className="workspace-hero card card-elevated">
      <div className="workspace-hero-grid">
        <div className="workspace-copy">
          {eyebrow ? <div className="workspace-kicker">{eyebrow}</div> : null}
          <div className="page-header workspace-header-block">
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {children ? <div className="workspace-supporting">{children}</div> : null}
        </div>

        <div className="workspace-side">
          {actions ? <div className="workspace-actions">{actions}</div> : null}
          {aside ? <div className="workspace-aside">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}
