
import React from 'react';
import { Article } from '../types';
import { Mail } from 'lucide-react';

interface SidebarRightArticleProps {
  article: Article;
}

export const SidebarRightArticle: React.FC<SidebarRightArticleProps> = ({ article }) => {
  return (
    <aside className="hidden xl:block w-[368px] p-[36px_40px] sticky top-[57px] h-screen overflow-y-auto scrollbar-hide bg-light-surface dark:bg-dark-surface border-l border-light-border dark:border-dark-border">
      
      {/* Author Profile */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <img 
            src={article.author.avatar} 
            alt={article.author.name} 
            className="w-16 h-16 rounded-full object-cover"
          />
          <div>
             <div className="font-medium text-lg text-light-textMain dark:text-dark-textMain">{article.author.name}</div>
             <div className="text-light-textSec dark:text-dark-textSec text-sm">{article.author.followers || '2K'} Followers</div>
          </div>
        </div>
        <p className="text-sm text-light-textSec dark:text-dark-textSec leading-relaxed mb-4">
            {article.author.bio || `Writing about technology, code, and the future of the web.`}
        </p>
        <div className="flex gap-2">
            <button className="bg-[#1a8917] hover:bg-[#156d12] text-white px-4 py-2 rounded-full text-sm font-medium transition-colors">
                Follow
            </button>
            <button className="bg-[#1a8917] hover:bg-[#156d12] text-white p-2 rounded-full transition-colors flex items-center justify-center">
                <Mail size={18} />
            </button>
        </div>
      </div>

      <div className="h-px bg-light-border dark:bg-dark-border my-8" />

      {/* Table of Contents */}
      {article.toc && article.toc.length > 0 && (
        <div className="mb-10">
            <div className="font-semibold text-base mb-4 text-light-textMain dark:text-dark-textMain">
                On this page
            </div>
            <div className="relative flex flex-col gap-2 pl-4 border-l-2 border-light-border dark:border-dark-border">
                {article.toc.map((item, index) => (
                    <a 
                        key={item.id} 
                        href={`#${item.id}`} 
                        className={`text-sm hover:text-light-textMain dark:hover:text-dark-textMain transition-colors block py-1 ${index === 0 ? 'text-light-textMain dark:text-dark-textMain font-medium -ml-[18px] border-l-2 border-light-textMain dark:border-dark-textMain pl-4' : 'text-light-textSec dark:text-dark-textSec'}`}
                        onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                        }}
                    >
                        {item.text}
                    </a>
                ))}
            </div>
        </div>
      )}

      {/* More from Medium Mock */}
      <div className="h-px bg-light-border dark:bg-dark-border my-8" />
      
      <div className="font-semibold text-base mb-4 text-light-textMain dark:text-dark-textMain">
        More from Pythoughts
      </div>
       <div className="text-[13px] text-light-textSec dark:text-dark-textSec mb-3 cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">
            Design principles for 2025
       </div>
       <div className="text-[13px] text-light-textSec dark:text-dark-textSec mb-3 cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">
            Why React 19 changes everything
       </div>
       <div className="text-[13px] text-light-textSec dark:text-dark-textSec cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">
            Understanding the new AI landscape
       </div>

    </aside>
  );
};
