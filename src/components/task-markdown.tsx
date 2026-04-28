"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { hasRichTextContent } from "@/utils/rich-text";

type TaskMarkdownEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type TaskMarkdownPreviewProps = {
  source: string;
};

function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-4 w-4 items-center justify-center">{children}</span>
  );
}

function BoldIcon() {
  return <span className="text-[1.2rem] font-bold leading-none">B</span>;
}

function ItalicIcon() {
  return <span className="text-[1.2rem] italic leading-none">I</span>;
}

function HeadingIcon() {
  return <span className="text-[0.8rem] font-semibold leading-none">H2</span>;
}

function BulletListIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="3" cy="4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <path d="M6 4h7M6 8h7M6 12h7" strokeLinecap="round" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M2.1 4.7V2.3l-0.8 0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.2 8.5h1.7L1.2 11h1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 4h7M6 8h7M6 12h7" strokeLinecap="round" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M5.7 4.2H4.4c-1 0-1.8 0.8-1.8 1.8v1.4c0 1 0.8 1.8 1.8 1.8h1.1c0.5 0 0.9 0.4 0.9 0.9v0.2c0 0.8-0.7 1.5-1.5 1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.4 4.2h-1.3c-1 0-1.8 0.8-1.8 1.8v1.4c0 1 0.8 1.8 1.8 1.8h1.1c0.5 0 0.9 0.4 0.9 0.9v0.2c0 0.8-0.7 1.5-1.5 1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M4.1 4.5c0-1.1 1.2-1.9 3-1.9 1.5 0 2.8 0.6 3.5 1.4"
        strokeLinecap="round"
      />
      <path d="M2.6 8h10.8" strokeLinecap="round" />
      <path
        d="M11.9 11.3c0 1.3-1.3 2.1-3.4 2.1-1.8 0-3.3-0.7-4-1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M5.7 4 2.5 8l3.2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.3 4 13.5 8l-3.2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditorToolbar({
  editor,
  disabled,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  disabled?: boolean;
}) {
  const actions = [
    {
      icon: <BoldIcon />,
      title: "加粗",
      isActive: editor.isActive("bold"),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: <ItalicIcon />,
      title: "斜体",
      isActive: editor.isActive("italic"),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: <StrikeIcon />,
      title: "删除线",
      isActive: editor.isActive("strike"),
      onClick: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      icon: <CodeIcon />,
      title: "行内代码",
      isActive: editor.isActive("code"),
      onClick: () => editor.chain().focus().toggleCode().run(),
    },
    {
      icon: <HeadingIcon />,
      title: "标题",
      isActive: editor.isActive("heading", { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: <BulletListIcon />,
      title: "无序列表",
      isActive: editor.isActive("bulletList"),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: <OrderedListIcon />,
      title: "有序列表",
      isActive: editor.isActive("orderedList"),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: <QuoteIcon />,
      title: "引用",
      isActive: editor.isActive("blockquote"),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  return (
    <div className="task-rich-text-toolbar flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-[linear-gradient(180deg,#fbfcfe_0%,#f3f6fb_100%)] px-2.5 py-2 dark:border-slate-700 dark:bg-[linear-gradient(180deg,#111827_0%,#0f172a_100%)]">
      {actions.map((action) => (
        <button
          key={action.title}
          type="button"
          aria-label={action.title}
          title={action.title}
          className={
            action.isActive
              ? "flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm transition dark:bg-slate-100 dark:text-slate-900"
              : "flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          }
          disabled={disabled}
          onClick={action.onClick}
        >
          <ToolbarIcon>{action.icon}</ToolbarIcon>
        </button>
      ))}
    </div>
  );
}

export function TaskMarkdownEditor({
  value,
  disabled,
  onChange,
}: TaskMarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [StarterKit],
    content: hasRichTextContent(value) ? value : "<p></p>",
    editorProps: {
      attributes: {
        class:
          "task-rich-text-editor min-h-[180px] px-4 py-3 text-sm leading-7 text-slate-700 focus:outline-none dark:text-slate-200",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      onChange(activeEditor.isEmpty ? "" : activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextValue = hasRichTextContent(value) ? value : "<p></p>";

    if (editor.getHTML() !== nextValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="task-rich-text-wrapper overflow-hidden rounded-xs border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/60">
      <EditorToolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function TaskMarkdownPreview({ source }: TaskMarkdownPreviewProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [StarterKit],
    content: hasRichTextContent(source) ? source : "<p></p>",
    editorProps: {
      attributes: {
        class:
          "task-rich-text-preview px-0 py-0 text-sm leading-7 text-slate-700 focus:outline-none dark:text-slate-200",
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextValue = hasRichTextContent(source) ? source : "<p></p>";

    if (editor.getHTML() !== nextValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, source]);

  if (!editor) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        Loading preview...
      </div>
    );
  }

  return <EditorContent editor={editor} />;
}
