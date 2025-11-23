
import React, { useState } from 'react';
import { Plus, Star, Bookmark, MoreHorizontal, MessageSquare } from 'lucide-react';

export const FollowingPage = () => {
  const [activeTab, setActiveTab] = useState('Writers and publications');

  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[728px] w-full px-6 pt-12 pb-20">
        
        {/* Header */}
        <h1 className="font-serif font-bold text-4xl text-light-textMain dark:text-dark-textMain mb-8">
          Following
        </h1>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-8 border-b border-light-border dark:border-dark-border pb-1">
          {['Writers and publications', 'Topics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain'
                  : 'border-transparent text-light-textSec dark:text-dark-textSec hover:text-light-textMain dark:hover:text-dark-textMain'
              }`}
            >
              {tab}
            </button>
          ))}
          <button className="ml-2 p-1 rounded-full border border-light-textSec dark:border-dark-textSec text-light-textSec dark:text-dark-textSec hover:border-light-textMain dark:hover:border-dark-textMain hover:text-light-textMain dark:hover:text-dark-textMain transition-colors">
            <Plus size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col">
          {MOCK_FOLLOWING_FEED.map((item) => (
            <FollowingCard key={item.id} item={item} />
          ))}
        </div>

      </div>
    </div>
  );
};

interface FollowingItem {
  id: string;
  publicationName: string;
  authorName: string;
  title: string;
  subtitle: string;
  date: string;
  stars?: string; // or claps/likes
  comments?: number;
  thumbnail: string;
}

interface FollowingCardProps {
  item: FollowingItem;
}

const FollowingCard: React.FC<FollowingCardProps> = ({ item }) => (
  <div className="py-6 border-b border-light-border dark:border-dark-border first:pt-0">
    {/* Context Header */}
    <div className="flex items-center gap-2 mb-2 text-[13px] text-light-textMain dark:text-dark-textMain">
      <div className="bg-[#2C3E50] text-white w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold">
        PY
      </div>
      <span className="text-light-textSec dark:text-dark-textSec">In</span>
      <span className="font-medium">{item.publicationName}</span>
      <span className="text-light-textSec dark:text-dark-textSec">by</span>
      <span className="font-medium">{item.authorName}</span>
    </div>

    <div className="flex justify-between gap-8 md:gap-12">
      <div className="flex-1">
        <h2 className="font-bold text-xl leading-tight mb-2 text-light-textMain dark:text-dark-textMain cursor-pointer hover:underline decoration-light-textMain dark:decoration-dark-textMain decoration-2 underline-offset-2">
          {item.title}
        </h2>
        <p className="text-light-textSec dark:text-dark-textSec text-base line-clamp-2 md:line-clamp-3 mb-3 font-serif">
          {item.subtitle}
        </p>
        
        {/* Footer */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3 text-[13px] text-light-textSec dark:text-dark-textSec">
            <div className="flex items-center gap-1 text-light-accent dark:text-yellow-500">
               <Star size={16} fill="currentColor" />
            </div>
            <span>{item.date}</span>
            {item.stars && <span className="hidden sm:inline-block">· {item.stars}</span>}
            {item.comments && (
                <div className="flex items-center gap-1 ml-2">
                     <MessageSquare size={16} /> {item.comments}
                </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-light-textSec dark:text-dark-textSec">
            <Bookmark size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" />
            <MoreHorizontal size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" />
          </div>
        </div>
      </div>

      <img 
        src={item.thumbnail} 
        alt={item.title} 
        className="w-[112px] h-[112px] md:w-[150px] md:h-[100px] object-cover bg-gray-100 dark:bg-gray-800 rounded-sm flex-shrink-0" 
      />
    </div>
  </div>
);

const MOCK_FOLLOWING_FEED: FollowingItem[] = [
  {
    id: '1',
    publicationName: 'Python in Plain English',
    authorName: 'Muhammad Umar Manzoor',
    title: '6 Python Libraries That Do the Hard Work for You',
    subtitle: '(Focus: Automation)',
    date: '7h ago',
    thumbnail: 'https://picsum.photos/seed/python1/200/150'
  },
  {
    id: '2',
    publicationName: 'Python in Plain English',
    authorName: 'Faisal haque',
    title: 'The Most In-Demand Tech Fields Industries Will Need in 2026',
    subtitle: "2026 is not going to be a normal year for technology. It's shaping up to be the year industries collectively pivot not because they want to, but because they have to.",
    date: '12h ago',
    stars: '53',
    thumbnail: 'https://picsum.photos/seed/tech1/200/150'
  },
  {
    id: '3',
    publicationName: 'Python in Plain English',
    authorName: 'Vignesh Selvaraj',
    title: 'From Hello World to Real-World: My 50-Project Python Transformation',
    subtitle: "A beginner's journey to Python-powered success.",
    date: '21h ago',
    stars: '58',
    thumbnail: 'https://picsum.photos/seed/code1/200/150'
  }
];
