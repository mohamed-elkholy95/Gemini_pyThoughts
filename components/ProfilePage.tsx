
import React, { useState } from 'react';
import { Article } from '../types';
import { ArticleCard } from './ArticleCard';
import { MoreHorizontal } from 'lucide-react';

interface ProfilePageProps {
  articles: Article[];
  onArticleClick: (article: Article) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ articles, onArticleClick }) => {
  const [activeTab, setActiveTab] = useState('Home');
  // Filter mock articles for the profile view (just reusing them all for demo)
  const profileArticles = articles; 

  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[728px] w-full px-6 pt-12 pb-20">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif font-bold text-[42px] leading-tight text-light-textMain dark:text-dark-textMain hidden md:block">
                Felix
            </h1>
            <h1 className="font-serif font-bold text-3xl leading-tight text-light-textMain dark:text-dark-textMain md:hidden">
                Felix
            </h1>
            <MoreHorizontal className="text-light-textSec dark:text-dark-textSec cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-8">
            {['Home', 'Lists', 'About'].map((tab) => (
                <div 
                    key={tab} 
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3.5 text-sm cursor-pointer transition-colors ${activeTab === tab 
                        ? 'border-b-2 border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain font-medium' 
                        : 'text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'}`}
                >
                    {tab}
                </div>
            ))}
        </div>

        {/* Content based on Tab */}
        {activeTab === 'Home' && (
            <div className="flex flex-col">
                {profileArticles.map(article => (
                    <ArticleCard key={article.id} article={article} onClick={onArticleClick} />
                ))}
            </div>
        )}

        {activeTab === 'Lists' && (
             <div className="py-12 text-center bg-light-secondary dark:bg-dark-secondary/30 rounded-lg border border-light-border dark:border-dark-border">
                <div className="text-light-textMain dark:text-dark-textMain font-medium mb-2">You haven't created any lists yet.</div>
                <div className="text-sm text-light-textSec dark:text-dark-textSec">Organize your favorite stories and share them with others.</div>
             </div>
        )}

        {activeTab === 'About' && (
            <div className="animate-fade-in-up">
                {/* Empty Bio State */}
                <div className="bg-light-secondary dark:bg-dark-secondary/30 p-12 text-center rounded-lg mb-12 border border-light-border dark:border-dark-border">
                    <h2 className="font-bold text-lg text-light-textMain dark:text-dark-textMain mb-3">Tell the world about yourself</h2>
                    <p className="text-sm text-light-textSec dark:text-dark-textSec max-w-md mx-auto mb-6 leading-relaxed">
                        Here’s where you can share more about yourself: your history, work experience, accomplishments, interests, dreams, and more. You can even add images and use rich text to personalize your bio.
                    </p>
                    <button className="px-5 py-2 rounded-full border border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain text-sm font-medium hover:bg-light-border dark:hover:bg-dark-border transition-colors">
                        Get started
                    </button>
                </div>

                {/* Footer Info */}
                <div className="border-t border-light-border dark:border-dark-border pt-8 text-sm text-light-textMain dark:text-dark-textMain">
                    <div className="mb-4 text-light-textSec dark:text-dark-textSec">
                        Pythoughts member since November 2025
                    </div>
                    <div className="mb-6 text-[#1a8917] hover:text-[#156d12] cursor-pointer font-medium">
                        6 following
                    </div>
                    <div className="flex items-center gap-2 text-xs text-light-textSec dark:text-dark-textSec uppercase tracking-wide font-medium">
                        Connect with Felix
                    </div>
                    <div className="mt-2 cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                        {/* Mock connection icon (e.g. Mastodon/Twitter placeholder) */}
                         <div className="w-6 h-6 bg-black dark:bg-white text-white dark:text-black rounded-[4px] flex items-center justify-center font-serif font-bold text-[14px]">
                            M
                         </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};
