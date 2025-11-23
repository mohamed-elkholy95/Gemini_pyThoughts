
import React, { useState, useCallback } from 'react';
import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import { 
  MoreHorizontal, Bell, Plus, X, Image as ImageIcon, 
  Search, Play, Code, Minus, Bold, Italic, Link as LinkIcon, 
  Unlink, Heading1, Heading2, Quote, Check, AlertCircle, Loader2
} from 'lucide-react';

interface EditorPageProps {
  onPublish: () => void;
  onGoBack: () => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({ onPublish, onGoBack }) => {
  const [title, setTitle] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);

  // Initialize Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2],
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      }),
      Placeholder.configure({
        placeholder: 'Tell your story...',
      }),
      CodeBlock,
    ],
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-lg max-w-none focus:outline-none min-h-[300px]',
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
            const { schema } = view.state;
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const node = schema.nodes.image.create({ src: e.target?.result });
            if (coordinates) {
              const transaction = view.state.tr.insert(coordinates.pos, node);
              view.dispatch(transaction);
            }
          };
          reader.readAsDataURL(file);
          return true; // handled
        }
        return false;
      }
    },
  });

  // --- Actions ---

  const handlePublish = async () => {
    if (!editor || !title.trim()) {
      setError("Please add a title and some content before publishing.");
      return;
    }

    if (editor.isEmpty) {
      setError("Your story cannot be empty.");
      return;
    }

    setIsPublishing(true);
    setError(null);

    // Simulate Network Request
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // 10% chance of failure to demonstrate error handling
          Math.random() > 0.9 ? reject(new Error("Network error: Failed to reach server.")) : resolve(true);
        }, 1500);
      });
      
      onPublish();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const addImage = useCallback(() => {
    const url = window.prompt('URL');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
      setIsToolbarOpen(false);
    }
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-body">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-body text-light-textMain dark:text-dark-textMain flex flex-col transition-colors duration-300">
      
      {/* Editor Navbar */}
      <nav className="h-[57px] flex items-center justify-between px-6 max-w-[1050px] mx-auto w-full sticky top-0 bg-white dark:bg-dark-body z-50">
        <div className="flex items-center gap-4">
           <div 
             className="font-logo text-[30px] cursor-pointer text-light-textMain dark:text-dark-textMain select-none pt-1"
             onClick={onGoBack}
             aria-label="Go back home"
           >
             Pythoughts
           </div>
           <span className="text-sm text-light-textSec dark:text-dark-textSec hidden sm:block">
              Draft in Felix
           </span>
        </div>
        <div className="flex items-center gap-4">
            {error && (
              <div className="hidden md:flex items-center gap-2 text-red-500 text-sm animate-pulse">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <button 
                className="bg-[#1a8917] hover:bg-[#156d12] text-white px-4 py-1.5 text-sm rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handlePublish}
                disabled={isPublishing || (!title && editor.isEmpty)}
                aria-label="Publish story"
            >
                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : 'Publish'}
            </button>
            <MoreHorizontal className="text-light-textSec dark:text-dark-textSec cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" size={24} />
            <Bell className="text-light-textSec dark:text-dark-textSec cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" size={24} />
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 bg-[url('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix')] bg-cover cursor-pointer"></div>
        </div>
      </nav>

      {/* Main Editor Area */}
      <main className="flex-1 max-w-[740px] w-full mx-auto px-6 mt-12 md:mt-20 pb-40 animate-fade-in-up relative">
        
        {/* Error Message Mobile */}
        {error && (
           <div className="md:hidden mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
             <AlertCircle size={16} /> {error}
           </div>
        )}

        {/* Title Input */}
        <div className="relative mb-4 group">
            <textarea 
                placeholder="Title" 
                className="w-full text-[42px] font-serif font-bold placeholder-gray-300 dark:placeholder-gray-600 border-none outline-none bg-transparent resize-none overflow-hidden leading-tight"
                rows={1}
                value={title}
                onChange={(e) => {
                    setTitle(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        editor.commands.focus();
                    }
                }}
            />
            <div className="absolute -left-10 top-3 opacity-0 group-hover:opacity-30 transition-opacity">
                 <Plus className="text-gray-400" />
            </div>
        </div>

        {/* Floating Menu (The + button on empty lines) */}
        {editor && (
          <FloatingMenu 
             editor={editor} 
             tippyOptions={{ duration: 100, placement: 'left' }} 
             className="flex items-center"
             shouldShow={({ state }) => {
               const { selection } = state;
               const { $from } = selection;
               return selection.empty && $from.parent.content.size === 0;
             }}
          >
             <div className="flex items-center gap-2 relative" onMouseDown={(e) => e.preventDefault()}> 
                <button 
                    className={`p-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-800 dark:hover:border-gray-300 hover:text-gray-800 dark:hover:text-gray-300 transition-all ${isToolbarOpen ? 'rotate-45' : ''}`}
                    onClick={() => setIsToolbarOpen(!isToolbarOpen)}
                >
                    <Plus size={20} />
                </button>

                {isToolbarOpen && (
                   <div className="absolute left-10 flex items-center gap-3 bg-white dark:bg-gray-800 p-1 animate-fade-in-up">
                       <button onClick={addImage} className="p-2 rounded-full border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Add Image">
                           <ImageIcon size={20} />
                       </button>
                       <button className="p-2 rounded-full border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Add Unsplash">
                           <Search size={20} />
                       </button>
                       <button className="p-2 rounded-full border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Add Video">
                           <Play size={20} />
                       </button>
                       <button className="p-2 rounded-full border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Add Embed">
                           <Code size={20} />
                       </button>
                       <button className="p-2 rounded-full border border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Add Divider">
                           <Minus size={20} />
                       </button>
                   </div>
                )}
             </div>
          </FloatingMenu>
        )}

        {/* Bubble Menu (Text Selection) */}
        {editor && (
          <BubbleMenu 
            editor={editor} 
            tippyOptions={{ duration: 100 }} 
            className="bg-black dark:bg-white text-white dark:text-black px-2 py-1 rounded shadow-lg flex items-center gap-1"
          >
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('bold') ? 'text-green-400' : ''}`}
            >
              <Bold size={18} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('italic') ? 'text-green-400' : ''}`}
            >
              <Italic size={18} />
            </button>
            <button
              onClick={setLink}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('link') ? 'text-green-400' : ''}`}
            >
              <LinkIcon size={18} />
            </button>
            <button
              onClick={() => editor.chain().focus().unsetLink().run()}
              disabled={!editor.isActive('link')}
              className="p-1.5 hover:text-red-400 disabled:opacity-30"
            >
              <Unlink size={18} />
            </button>
            <div className="w-px h-4 bg-gray-600 mx-1"></div>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('heading', { level: 1 }) ? 'text-green-400' : ''}`}
            >
              <Heading1 size={18} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('heading', { level: 2 }) ? 'text-green-400' : ''}`}
            >
              <Heading2 size={18} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleQuote().run()}
              className={`p-1.5 hover:text-green-400 ${editor.isActive('quote') ? 'text-green-400' : ''}`}
            >
              <Quote size={18} />
            </button>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} />
      </main>
    </div>
  );
};
