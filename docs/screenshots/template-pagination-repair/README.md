# Website design & build pagination repair

Reproduced locally at 1440px with the starter content, the reported 0.4-inch header and 31px gap, and the old saved page breaks. The images use a sample workspace logo and do not contain live client details. After images use the guarded rollout's 0.25-inch header and 8px gap.

| Page | Editor before | Editor after | PDF before | PDF after |
| --- | --- | --- | --- | --- |
| 4 | [Investment](before-editor-4-1440.png) | [Investment](after-editor-4-1440.png) | [Investment](before-pdf-1440-4.png) | [Investment](after-pdf-1440-4.png) |
| 5 | [Terms cross the footer](before-editor-5-1440.png) | [Terms stay within the page](after-editor-5-1440.png) | [Terms using the stored breaks](before-pdf-1440-5.png) | [Terms with fresh breaks](after-pdf-1440-5.png) |
| 6 | [Empty continuation](before-editor-6-1440.png) | [Terms continue](after-editor-6-1440.png) | [Terms using the stored breaks](before-pdf-1440-6.png) | [Governing law and Entire agreement](after-pdf-1440-6.png) |
| 7 | [Signatures](before-editor-7-1440.png) | [Last Terms clauses](after-editor-7-1440.png) | [Signatures](before-pdf-1440-7.png) | [Signatures](after-pdf-1440-7.png) |

The editor shows all editable contract text, so [Signatures move to page 8](after-editor-8-1440.png). The client and PDF previews show the default Own It Now selection, which omits the conditional Own It Over Time clause. The before PDF rendered the old stored breaks; it did not use the editor's clause clipping style.
