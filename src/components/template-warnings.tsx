import { inactiveTemplateItems } from "../lib/template-quote";
import type { Item, Template } from "../lib/model";
export function TemplateWarnings({
  templates,
  catalog,
}: {
  templates: Template[];
  catalog: Item[];
}) {
  const affected = templates
    .map((t) => ({ template: t, items: inactiveTemplateItems(t, catalog) }))
    .filter((t) => t.items.length);
  if (!affected.length) return null;
  return (
    <section className="card stack" aria-label="Inactive template defaults">
      <h3>Templates with inactive or missing pricing items</h3>
      <p role="alert">
        These defaults will be skipped when creating a proposal. Review the
        template before using its default quote.
      </p>
      <ul>
        {affected.map(({ template, items }) => (
          <li key={template.id}>
            <a href={`/templates/${template.id}/edit`}>{template.name}</a>:{" "}
            {items.map((i) => `${i.name} (${i.state})`).join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
