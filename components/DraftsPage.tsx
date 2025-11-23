
import React, { useState } from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
import { Article } from '../types';
import { MOCK_ARTICLES } from '../constants';

interface DraftsPageProps {
  onArticleClick?: (article: Article) => void;
}

export const DraftsPage: React.FC<DraftsPageProps> = ({ onArticleClick }) => {
  const [activeTab, setActiveTab] = useState('Drafts 14');

  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[1000px] w-full px-6 pt-10 pb-20">
        
        <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif font-bold text-4xl text-light-textMain dark:text-dark-textMain">
                Stories
            </h1>
            <div className="flex gap-3">
                 <button className="px-4 py-2 rounded-full border border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain text-sm font-medium hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors">
                    Import a story
                 </button>
                 <button className="bg-[#1a8917] hover:bg-[#156d12] text-white px-5 py-2 rounded-full text-sm font-medium transition-colors">
                    Write a story
                 </button>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-8">
            {['Drafts 14', 'Published 6', 'Unlisted', 'Submissions'].map((tab, i) => (
                <div 
                    key={tab} 
                    onClick={() => setActiveTab(tab)}
                    className={`pb-4 text-sm cursor-pointer transition-colors ${activeTab === tab 
                        ? 'border-b-2 border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain font-medium' 
                        : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                >
                    {tab}
                </div>
            ))}
        </div>

        {/* List Header */}
         <div className="flex justify-between text-sm text-light-textSec dark:text-dark-textSec border-b border-light-border dark:border-dark-border pb-4 mb-4">
             <div className="flex-1">Title</div>
             <div className="w-32 hidden md:block">Publication</div>
             <div className="w-24 hidden md:block">Status</div>
             <div className="w-10"></div>
         </div>

         {/* Content */}
         <div className="space-y-2">
             {activeTab.startsWith('Drafts') && MOCK_DRAFTS.map((draft, i) => (
                 <div key={i} className="flex items-start justify-between py-4 group border-b border-light-border dark:border-dark-border last:border-0">
                     <div className="flex-1 pr-4">
                         <h3 className="font-bold text-base text-light-textMain dark:text-dark-textMain mb-1 cursor-pointer">{draft.title}</h3>
                         <div className="text-sm text-light-textSec dark:text-dark-textSec flex gap-2">
                             <span>{draft.date}</span>
                             <span>·</span>
                             <span>{draft.readTime}</span>
                         </div>
                     </div>
                     <div className="w-32 hidden md:flex items-center text-sm text-light-textSec dark:text-dark-textSec">
                         {draft.pub}
                     </div>
                      <div className="w-24 hidden md:flex items-center text-sm text-light-textSec dark:text-dark-textSec">
                         {draft.status}
                     </div>
                     <div className="w-10 flex justify-end">
                         <MoreHorizontal size={20} className="text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer" />
                     </div>
                 </div>
             ))}

             {activeTab.startsWith('Published') && MOCK_ARTICLES.map((article) => (
                 <div key={article.id} className="flex items-start justify-between py-4 group border-b border-light-border dark:border-dark-border last:border-0">
                     <div className="flex-1 pr-4">
                         <h3 
                            className="font-bold text-base text-light-textMain dark:text-dark-textMain mb-1 cursor-pointer hover:underline"
                            onClick={() => onArticleClick?.(article)}
                         >
                             {article.title}
                         </h3>
                         <div className="text-sm text-light-textSec dark:text-dark-textSec flex gap-2">
                             <span>Published on {article.date}</span>
                             <span>·</span>
                             <span>{article.readTime || '5 min read'}</span>
                         </div>
                     </div>
                     <div className="w-32 hidden md:flex items-center text-sm text-light-textSec dark:text-dark-textSec">
                         {article.publication ? article.publication.name : '-'}
                     </div>
                      <div className="w-24 hidden md:flex items-center text-sm text-light-textSec dark:text-dark-textSec">
                         Published
                     </div>
                     <div className="w-10 flex justify-end">
                         <MoreHorizontal size={20} className="text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer" />
                     </div>
                 </div>
             ))}
         </div>

      </div>
    </div>
  );
};

const MOCK_DRAFTS = [
    { title: "Untitled story", date: "Updated 2d ago", readTime: "1 min read (0 words)", pub: "-", status: "Draft" },
    { title: "dsada", date: "Updated 2d ago", readTime: "1 min read (1 words)", pub: "-", status: "Draft" },
    { title: "hello", date: "Updated 2d ago", readTime: "1 min read (1 words)", pub: "-", status: "Draft" },
    { title: "Untitled story", date: "Updated 4d ago", readTime: "1 min read (0 words)", pub: "-", status: "Draft" },
    { title: "Photo by Ioana Cristiana on Unsplash", date: "Updated 5d ago", readTime: "1 min read (0 words)", pub: "-", status: "Draft" },
];
