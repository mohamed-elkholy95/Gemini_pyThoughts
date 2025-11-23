
import React, { useState, useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import ImageTool from '@editorjs/image';
import Quote from '@editorjs/quote';
import Embed from '@editorjs/embed';
import Marker from '@editorjs/marker';
import { MoreHorizontal, Bell, Loader2, AlertCircle } from 'lucide-react';

interface EditorPageProps {
  onPublish: () => void;
  onGoBack: () => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({ onPublish, onGoBack }) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const holderId = 'editorjs-holder';

  useEffect(() => {
    if (!editorRef.current) {
      const editor = new EditorJS({
        holder: holderId,
        placeholder: 'Tell your story...',
        tools: {
          header: {
            class: Header,
            config: {
              placeholder: 'Title',
              levels: [1, 2],
              defaultLevel: 1
            },
            inlineToolbar: true
          },
          list: {
            class: List,
            inlineToolbar: true,
          },
          quote: {
            class: Quote,
            inlineToolbar: true,
            config: {
              quotePlaceholder: 'Enter a quote',
              captionPlaceholder: 'Quote author',
            },
          },
          marker: {
            class: Marker,
          },
          embed: {
            class: Embed,
            config: {
              services: {
                youtube: true,
                coub: true
              }
            }
          },
          image: {
            class: ImageTool,
            config: {
              uploader: {
                uploadByFile(file: File) {
                  // Simulate upload by converting to base64 locally
                  return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      resolve({
                        success: 1,
                        file: {
                          url: e.target?.result as string,
                        }
                      });
                    };
                    reader.readAsDataURL(file);
                  });
                },
                uploadByUrl(url: string) {
                  return new Promise((resolve) => {
                     resolve({
                        success: 1,
                        file: {
                          url: url,
                        }
                     })
                  });
                }
              }
            }
          }
        },
        data: {
            blocks: []
        },
        onChange: () => {
             // Autosave logic could go here
             // editor.save().then((outputData) => console.log(outputData));
        },
        autofocus: true,
      });
      editorRef.current = editor;
    }

    return () => {
      if (editorRef.current && editorRef.current.destroy) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  const handlePublish = async () => {
    if (!editorRef.current) return;

    setIsPublishing(true);
    setError(null);

    try {
      const outputData = await editorRef.current.save();
      
      if (outputData.blocks.length === 0) {
        setError("Your story cannot be empty.");
        setIsPublishing(false);
        return;
      }

      // Simulate Network Request
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // 10% chance of failure
          Math.random() > 0.9 ? reject(new Error("Network error: Failed to reach server.")) : resolve(true);
        }, 1500);
      });

      console.log('Published Data:', outputData);
      onPublish();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsPublishing(false);
    }
  };

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
                disabled={isPublishing}
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
         {error && (
           <div className="md:hidden mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
             <AlertCircle size={16} /> {error}
           </div>
        )}
        
        <div id={holderId} className="prose dark:prose-invert prose-lg max-w-none"></div>
      </main>
    </div>
  );
};
