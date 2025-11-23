import React from 'react';
import { Article } from '../types';
import { PlayCircle, Share, MoreHorizontal, MessageSquare, Star, Bookmark } from 'lucide-react';

interface ArticlePageProps {
  article: Article;
}

export const ArticlePage: React.FC<ArticlePageProps> = ({ article }) => {
  return (
    <div className="w-full flex justify-center bg-light-surface dark:bg-dark-surface min-h-screen pb-20">
      <div className="max-w-[1000px] w-full px-6 pt-10">
        
        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-12 items-start">
          
          {/* Left Column: Publication Info */}
          <div className="hidden lg:block sticky top-24">
             {article.publication ? (
               <>
                 <div className="font-bold text-lg mb-6 text-light-textMain dark:text-dark-textMain">{article.publication.name}</div>
                 <img src={article.publication.logo} alt={article.publication.name} className="w-12 h-12 mb-4 rounded" />
                 <p className="text-[13px] leading-6 text-light-textSec dark:text-dark-textSec mb-6">
                    {article.publication.description}
                 </p>
                 <button className="text-[13px] text-light-textMain dark:text-dark-textMain underline hover:text-black dark:hover:text-white">
                    Follow publication
                 </button>
               </>
             ) : (
                <div className="text-sm text-light-textSec dark:text-dark-textSec">
                   No publication info available.
                </div>
             )}
          </div>

          {/* Right Column: Article Content */}
          <div className="min-w-0">
            
            {/* Title Block */}
            <h1 className="font-sans font-extrabold text-3xl md:text-[40px] leading-tight text-light-textMain dark:text-dark-textMain mb-3 tracking-tight">
                {article.title}
            </h1>
            <h2 className="font-sans text-xl md:text-[22px] text-light-textSec dark:text-dark-textSec mb-8 leading-snug">
                {article.subtitle}
            </h2>

            {/* Author Block */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <img src={article.author.avatar} alt={article.author.name} className="w-11 h-11 rounded-full" />
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-light-textMain dark:text-dark-textMain font-medium">{article.author.name}</span>
                            <button className="text-sm px-2.5 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-light-textSec dark:text-dark-textSec hover:border-gray-800 dark:hover:border-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                                Follow
                            </button>
                        </div>
                        <div className="text-light-textSec dark:text-dark-textSec text-[13px] flex items-center gap-1 mt-0.5">
                            <span>{article.readTime || '5 min read'}</span>
                            <span>·</span>
                            <span>{article.date}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="border-t border-b border-light-border dark:border-dark-border py-3 flex justify-between mb-10 text-light-textSec dark:text-dark-textSec">
                <div className="flex gap-6 items-center">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain group">
                        <Star size={20} className="group-hover:text-light-textMain dark:group-hover:text-dark-textMain" /> 
                        <span className="text-sm">{article.likes}</span>
                    </div>
                    <div className="flex items-center gap-2 cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain group">
                        <MessageSquare size={20} className="group-hover:text-light-textMain dark:group-hover:text-dark-textMain" /> 
                        <span className="text-sm">{article.comments}</span>
                    </div>
                </div>
                <div className="flex gap-5 items-center">
                     <Bookmark size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain"/>
                     <PlayCircle size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain"/>
                     <Share size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain"/>
                     <MoreHorizontal size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain"/>
                </div>
            </div>

            {/* Main Image */}
            <figure className="mb-12">
                <img src={article.thumbnail} alt={article.title} className="w-full h-auto object-cover rounded-sm" />
            </figure>

            {/* Content Body */}
            <div 
                className="prose dark:prose-invert prose-lg max-w-none font-serif text-light-textMain dark:text-dark-textMain leading-8 [&>p]:mb-6 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mt-10 [&>h3]:mb-4 [&>h3]:font-sans [&>blockquote]:border-l-4 [&>blockquote]:border-light-textMain [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-xl"
                dangerouslySetInnerHTML={{ __html: article.content || '<p>Content loading...</p>' }}
            />

            {/* Article Footer Tags */}
            <div className="mt-14 flex flex-wrap gap-2">
                {['Technology', 'Programming', 'AI', 'Google'].map(tag => (
                    <span key={tag} className="px-4 py-2 bg-light-pill dark:bg-dark-pill rounded-full text-sm text-light-textMain dark:text-dark-textMain cursor-pointer hover:bg-light-border dark:hover:bg-dark-border transition-colors">
                        {tag}
                    </span>
                ))}
            </div>

            {/* Claps footer */}
             <div className="bg-light-secondary dark:bg-dark-secondary p-8 mt-12 rounded-lg flex items-center justify-between">
                <div className="font-bold text-light-textMain dark:text-dark-textMain">
                    Enjoyed this read?
                </div>
                <div className="flex gap-6 text-light-textSec dark:text-dark-textSec">
                    <Star size={24} className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer transition-colors" />
                    <Share size={24} className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer transition-colors" />
                    <MoreHorizontal size={24} className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer transition-colors" />
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};