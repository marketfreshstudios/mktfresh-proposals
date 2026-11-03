import { type ReactNode, type ReactElement, type CSSProperties } from "react";
import type { Block } from "../lib/model";
import type { PagePlan } from "../lib/page-plan";
import { signaturePairStarts } from "../lib/signature-presentation";
export function pairSignatureNodes(
  content: Block[],
  nodes: ReactNode[],
  plan?: PagePlan,
) {
  const starts = signaturePairStarts(content, plan),
    result: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++)
    if (starts.has(i)) {
      const first = nodes[i] as ReactElement<{
        spaceBefore?: number;
        style?: CSSProperties;
      }>;
      const space =
        first.props.spaceBefore === undefined
          ? (first.props.style as Record<string, unknown> | undefined)?.[
              "--block-space-before"
            ]
          : `${first.props.spaceBefore}px`;
      result.push(
        <div
          className="signature-pair"
          key={`pair-${content[i].id}`}
          style={{ "--block-space-before": space } as CSSProperties}
        >
          {nodes[i]}
          {nodes[++i]}
        </div>,
      );
    } else result.push(nodes[i]);
  return result;
}
