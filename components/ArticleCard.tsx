import React, { useState } from 'react';
import { Article } from '../types';
import { Star, MinusCircle, Bookmark, MoreHorizontal, MessageSquare } from 'lucide-react';

interface ArticleCardProps {
  article: Article;
  onClick: (article: Article) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  return (
    <div 
      className="w-full cursor-pointer group"
      onClick={() => onClick(article)}
    >
      <div className="max-w-[680px] w-full mx-auto px-6 md:px-0 border-b border-light-border dark:border-dark-border py-6 relative">
        
        {/* Header */}
        <div className="flex items-center gap-2 text-[13px] mb-2 text-light-textMain dark:text-dark-textMain">
          <img src={article.author.avatar} alt={article.author.name} className="w-6 h-6 rounded-full" />
          <span className="font-medium">{article.author.name}</span>
        </div>

        {/* Content & Image */}
        <div className="flex justify-between gap-10">
          <div className="flex-1">
            <h2 className="font-serif font-extrabold text-xl leading-7 mb-1.5 text-light-textMain dark:text-dark-textMain group-hover:underline decoration-light-textMain dark:decoration-dark-textMain decoration-2 underline-offset-4">
              {article.title}
            </h2>
            <p className="font-sans text-light-textSec dark:text-dark-textSec text-base leading-6 line-clamp-2 mb-2 hidden md:block">
              {article.subtitle}
            </p>
          </div>
          <img 
            src={article.thumbnail} 
            alt="Thumbnail" 
            className="w-20 h-20 md:w-28 md:h-28 bg-light-pill dark:bg-dark-pill object-cover rounded-sm flex-shrink-0"
          />
        </div>

        {/* Footer / Meta */}
        <div className="flex items-center justify-between mt-6 text-[13px] text-light-textSec dark:text-dark-textSec">
          <div className="flex items-center gap-2 md:gap-4">
            <span className="bg-light-pill dark:bg-dark-pill px-2 py-0.5 rounded-full text-xs hidden md:block">Technology</span>
            <span>{article.date}</span>
            <div className="flex items-center gap-1">
              <Star size={16} />
              <span>{article.likes}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare size={16} />
              <span>{article.comments}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 relative">
            <MinusCircle className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer" size={20} />
            <Bookmark className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer" size={20} />
            
            {/* More / Menu Trigger */}
            <div className="relative">
              <MoreHorizontal 
                className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer" 
                size={20} 
                onClick={handleMenuClick}
              />
              
              {/* Dropdown Menu */}
              {showMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div 
                    className="fixed inset-0 z-40 cursor-default" 
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} 
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-100 dark:border-gray-700 z-50 py-2 animate-fade-in-up">
                    <div className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3">
                       <MinusCircle size={18} className="text-gray-400"/> Show less like this
                    </div>
                    <div className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                       Follow author
                    </div>
                    <div className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                       Mute author
                    </div>
                    <div className="px-4 py-2.5 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                       Report story...
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};