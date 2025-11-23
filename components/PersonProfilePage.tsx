
import React from 'react';
import { Star, Bookmark, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';

interface PersonProfilePageProps {
  name: string;
}

export const PersonProfilePage: React.FC<PersonProfilePageProps> = ({ name }) => {
  // Mock data specifically for the screenshot demo (Vignesh)
  const isVignesh = name.includes('Vignesh');
  
  const profileData = {
    name: isVignesh ? "Vignesh Selvaraj" : name,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${isVignesh ? 'Vignesh' : name}`,
    followers: "707",
    bio: "Python & Data Science engineer | Django + Docker + Cloud | Turning data into scalable solutions | Support m...",
  };

  const articles = [
    {
      id: 1,
      pubName: "Python in Plain English",
      pubIcon: "PY",
      title: "How One Cheat Sheet Saved Me From Quitting Django—And Why It Can Change Your Developer Journey...",
      subtitle: "I remember the exact night I almost quit Django.",
      thumbnail: "https://picsum.photos/seed/django/300/200",
      date: "Just now"
    },
    {
      id: 2,
      pubName: "Python in Plain English",
      pubIcon: "PY",
      title: "From Hello World to Real-World: My 50-Project Python Transformation",
      subtitle: "From Hello World to Real-World: My 50-Project Python Transformation", // Screenshot shows title repeated or similar text
      thumbnail: "https://picsum.photos/seed/python50/300/200",
      date: "1 day ago"
    }
  ];

  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[728px] w-full px-6 pt-10 pb-20">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-light-textSec dark:text-dark-textSec mb-8">
            <span className="hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer">Following</span>
            <ChevronRight size={16} />
            <span className="text-light-textMain dark:text-dark-textMain">{profileData.name}</span>
        </div>

        {/* Profile Header Card */}
        <div className="border border-light-border dark:border-dark-border rounded-lg p-6 mb-12 bg-white dark:bg-dark-surface">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                    <img 
                        src={profileData.avatar} 
                        alt={profileData.name} 
                        className="w-[72px] h-[72px] rounded-full bg-gray-100"
                    />
                    <div>
                        <h1 className="font-bold text-2xl text-light-textMain dark:text-dark-textMain">{profileData.name}</h1>
                        <div className="text-sm text-light-textSec dark:text-dark-textSec">{profileData.followers} followers</div>
                    </div>
                </div>
                <button className="flex items-center gap-1 px-4 py-2 rounded-full border border-light-textMain dark:border-dark-textMain text-light-textMain dark:text-dark-textMain text-sm font-medium hover:bg-light-secondary dark:hover:bg-dark-secondary transition-colors">
                    Following <ChevronDown size={16} />
                </button>
            </div>
            <p className="text-sm text-light-textSec dark:text-dark-textSec leading-relaxed">
                {profileData.bio}
            </p>
        </div>

        {/* Articles Feed */}
        <div className="flex flex-col border-t border-light-border dark:border-dark-border">
            {articles.map(article => (
                <div key={article.id} className="py-8 border-b border-light-border dark:border-dark-border">
                    <div className="flex items-center gap-2 mb-3 text-[13px] text-light-textMain dark:text-dark-textMain">
                        <div className="bg-[#2C3E50] text-white w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold">
                            {article.pubIcon}
                        </div>
                        <span className="text-light-textSec dark:text-dark-textSec">Published in</span>
                        <span className="font-medium">{article.pubName}</span>
                    </div>

                    <div className="flex justify-between gap-8 md:gap-12">
                        <div className="flex-1">
                            <h2 className="font-bold text-xl md:text-2xl leading-tight mb-2 text-light-textMain dark:text-dark-textMain cursor-pointer hover:underline decoration-light-textMain dark:decoration-dark-textMain decoration-2 underline-offset-2">
                                {article.title}
                            </h2>
                            <p className="text-light-textSec dark:text-dark-textSec text-base line-clamp-2 mb-4 font-serif">
                                {article.subtitle}
                            </p>
                            
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[13px] text-light-textSec dark:text-dark-textSec">
                                    <Star size={16} className="text-light-accent dark:text-yellow-500" fill="currentColor" />
                                    <span>{article.date}</span>
                                </div>
                                <div className="flex items-center gap-3 text-light-textSec dark:text-dark-textSec">
                                    <Bookmark size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" />
                                    <MoreHorizontal size={20} className="cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain" />
                                </div>
                            </div>
                        </div>
                        
                        <img 
                            src={article.thumbnail} 
                            alt="Thumbnail" 
                            className="w-[112px] h-[112px] md:w-[160px] md:h-[107px] object-cover bg-gray-100 dark:bg-gray-800 rounded-sm" 
                        />
                    </div>
                </div>
            ))}
        </div>

      </div>
    </div>
  );
};
