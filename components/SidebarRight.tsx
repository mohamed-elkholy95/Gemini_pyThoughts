import React from 'react';
import { STAFF_PICKS, TOPICS } from '../constants';
import { Star, Verified } from 'lucide-react';

export const SidebarRight: React.FC = () => {
  return (
    <aside className="hidden xl:block w-[368px] p-[36px_40px] sticky top-[57px] h-screen overflow-y-auto scrollbar-hide bg-light-surface dark:bg-dark-surface border-l border-light-border dark:border-dark-border">
      <div className="font-semibold text-base mb-6 text-light-textMain dark:text-dark-textMain">Staff Picks</div>

      {STAFF_PICKS.map((pick, i) => (
        <div key={i} className="mb-6">
          <div className="flex items-center gap-2 text-[13px] mb-1.5 font-medium text-light-textMain dark:text-dark-textMain">
            <img src={pick.author.avatar} alt={pick.author.name} className="w-5 h-5 rounded-full" />
            {pick.author.name}
            {pick.author.isPro && <Verified size={12} className="text-light-accent dark:text-yellow-500" fill="currentColor" />}
          </div>
          <div className="font-serif font-bold text-base mb-1.5 leading-tight cursor-pointer text-light-textMain dark:text-dark-textMain hover:underline decoration-light-textMain dark:decoration-dark-textMain">
            {pick.title}
          </div>
          <div className="text-[13px] text-light-textSec dark:text-dark-textSec flex items-center gap-1">
             <Star size={12} className="text-light-accent dark:text-yellow-500" fill="currentColor" /> {pick.date}
          </div>
        </div>
      ))}

      <div className="text-[#1a8917] hover:text-[#156d12] text-sm cursor-pointer mb-10">See the full list</div>

      <div className="font-semibold text-base mb-6 text-light-textMain dark:text-dark-textMain">Recommended topics</div>
      
      <div className="flex flex-wrap gap-2.5 mb-6">
        {TOPICS.map((topic, i) => (
          <span key={i} className="bg-light-pill dark:bg-dark-pill px-4 py-2 rounded-full text-sm text-light-textMain dark:text-dark-textMain cursor-pointer hover:bg-light-hover dark:hover:bg-dark-hover transition-colors">
            {topic.name}
          </span>
        ))}
      </div>

      <div className="text-light-textSec dark:text-dark-textSec text-[13px] hover:text-light-textMain dark:hover:text-dark-textMain cursor-pointer">
        See more topics
      </div>

      <div className="mt-10 pt-6 border-t border-light-border dark:border-dark-border flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-light-textSec dark:text-dark-textSec">
          <span>Help</span>
          <span>Status</span>
          <span>Writers</span>
          <span>Blog</span>
          <span>Careers</span>
          <span>Privacy</span>
          <span>Terms</span>
          <span>About</span>
          <span>Text to speech</span>
          <span>Teams</span>
      </div>
    </aside>
  );
};