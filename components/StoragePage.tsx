import React from 'react';
import { Lock, MoreHorizontal, Bookmark, X } from 'lucide-react';

export const StoragePage = () => {
  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[1000px] w-full px-6 pt-10 pb-20">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif font-bold text-4xl text-light-textMain dark:text-dark-textMain">
                Your storage
            </h1>
            <button className="bg-[#1a8917] hover:bg-[#156d12] text-white px-5 py-2 rounded-full text-sm font-medium transition-colors">
                New list
            </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-8 overflow-x-auto scrollbar-hide">
            {['Your lists', 'Saved lists', 'Highlights', 'Reading history', 'Responses'].map((tab, i) => (
                <div 
                    key={tab} 
                    className={`pb-4 text-sm whitespace-nowrap cursor-pointer transition-colors ${i === 0 
                        ? 'border-b-2 border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain font-medium' 
                        : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                >
                    {tab}
                </div>
            ))}
        </div>

        {/* Promo Banner */}
        <div className="relative bg-[#1a8917] rounded-lg p-8 mb-12 flex flex-col md:flex-row items-center justify-between overflow-hidden shadow-sm">
            <div className="relative z-10 max-w-md">
                <h2 className="font-serif font-bold text-2xl text-white mb-6 leading-tight">
                    Create a list to easily organize and share stories
                </h2>
                <button className="bg-black text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-gray-900 transition-colors">
                    Start a list
                </button>
            </div>
            {/* Circle Decoration */}
            <div className="hidden md:flex absolute right-0 top-0 bottom-0 w-1/2 justify-center items-center pointer-events-none">
                 <div className="w-64 h-64 bg-green-600/50 rounded-full flex items-center justify-center translate-x-12">
                     <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
                        <Bookmark className="text-black ml-0.5" size={24} fill="black" />
                     </div>
                 </div>
            </div>
            <button className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Storage Lists */}
        <div className="space-y-6">
            <StorageCard title="Reading list" count="No stories" isPrivate />
            <StorageCard title="Coding" count="No stories" isPrivate />
        </div>

      </div>
    </div>
  );
};

const StorageCard = ({ title, count, isPrivate }: { title: string, count: string, isPrivate?: boolean }) => (
    <div className="flex flex-col md:flex-row bg-light-secondary dark:bg-dark-secondary/30 border border-light-border dark:border-dark-border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-auto md:h-48 group">
        <div className="flex-1 p-6 flex flex-col justify-between">
            <div>
                <div className="flex items-center gap-3 mb-3">
                     <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                         <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                     </div>
                     <span className="text-sm font-medium text-light-textMain dark:text-dark-textMain">Felix</span>
                </div>
                <h3 className="font-bold text-xl md:text-2xl text-light-textMain dark:text-dark-textMain mb-2 group-hover:text-[#1a8917] transition-colors">{title}</h3>
                <div className="flex items-center gap-2 text-sm text-light-textSec dark:text-dark-textSec">
                    <span>{count}</span>
                    {isPrivate && <Lock size={14} />}
                </div>
            </div>
            <div className="flex items-center justify-between mt-4">
                 <div className="flex gap-1">
                    {/* Placeholder covers */}
                     <div className="w-8 h-8 rounded-full bg-light-border dark:bg-dark-border border-2 border-white dark:border-dark-surface"></div>
                     <div className="w-8 h-8 rounded-full bg-light-border dark:bg-dark-border border-2 border-white dark:border-dark-surface -ml-3"></div>
                     <div className="w-8 h-8 rounded-full bg-light-border dark:bg-dark-border border-2 border-white dark:border-dark-surface -ml-3"></div>
                 </div>
                 <MoreHorizontal size={20} className="text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain" />
            </div>
        </div>
        <div className="flex w-full md:w-1/3 bg-gray-100 dark:bg-gray-800 border-l border-light-border dark:border-dark-border">
             <div className="flex-1 bg-gray-200 dark:bg-gray-700/50 border-r border-light-surface dark:border-dark-surface"></div>
             <div className="flex-1 bg-gray-200 dark:bg-gray-700/50 border-r border-light-surface dark:border-dark-surface"></div>
             <div className="flex-1 bg-gray-200 dark:bg-gray-700/50"></div>
        </div>
    </div>
);