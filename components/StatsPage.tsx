
import React, { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';

export const StatsPage = () => {
  const [activeTab, setActiveTab] = useState('Stories');

  return (
    <div className="w-full flex justify-center min-h-screen bg-light-surface dark:bg-dark-surface">
      <div className="max-w-[1000px] w-full px-6 pt-10 pb-20">
        <h1 className="font-serif font-bold text-4xl text-light-textMain dark:text-dark-textMain mb-8">Stats</h1>

        {/* Tabs */}
        <div className="flex items-center gap-8 border-b border-light-border dark:border-dark-border mb-10">
            {['Stories', 'Audience'].map((tab) => (
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

        {activeTab === 'Stories' ? (
          <>
            {/* Monthly Stats */}
            <div className="mb-12">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h2 className="font-bold text-xl text-light-textMain dark:text-dark-textMain">Monthly</h2>
                        <div className="text-sm text-light-textSec dark:text-dark-textSec mt-1">November 1, 2025 – Today (UTC) · Updated hourly</div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-light-border dark:border-dark-border hover:border-light-textSec dark:hover:border-dark-textSec transition-colors text-sm font-medium text-light-textMain dark:text-dark-textMain">
                        November 2025 <ChevronDown size={16} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-6 md:gap-10 border-b border-light-border dark:border-dark-border pb-4 mb-6">
                    <StatMetric label="Presentations" value="40" hasInfo />
                    <StatMetric label="Views" value="17" />
                    <StatMetric label="Reads" value="6" />
                    <StatMetric label="Followers" value="0" />
                    <StatMetric label="Subscribers" value="0" />
                </div>

                {/* Chart Area */}
                <div className="h-[250px] w-full mt-8">
                    <MockChart />
                </div>
            </div>

            {/* Lifetime Stats */}
            <div>
                <div className="flex justify-between items-end mb-8 border-t border-light-border dark:border-dark-border pt-10">
                    <div>
                        <h2 className="font-bold text-xl text-light-textMain dark:text-dark-textMain">Lifetime</h2>
                        <div className="text-sm text-light-textSec dark:text-dark-textSec mt-1">November 7, 2025 – Today (UTC) · Updated daily</div>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-light-border dark:border-dark-border hover:border-light-textSec dark:hover:border-dark-textSec transition-colors text-sm font-medium text-light-textMain dark:text-dark-textMain">
                        Latest <ChevronDown size={16} />
                    </button>
                </div>

                {/* Table Header */}
                <div className="flex border-b border-light-border dark:border-dark-border pb-2 mb-4 text-xs font-medium text-light-textSec dark:text-dark-textSec uppercase tracking-wider">
                    <div className="flex-1">Story</div>
                    <div className="w-24 text-center flex items-center justify-center gap-1 hidden sm:flex">Presentations <Info size={12} /></div>
                    <div className="w-20 text-center hidden sm:block">Views</div>
                    <div className="w-20 text-center hidden sm:block">Reads</div>
                </div>

                {/* Table Rows */}
                <div className="space-y-6">
                    {LIFETIME_STATS.map((stat, i) => (
                        <div key={i} className="flex items-start group">
                            <div className="flex-1 pr-4">
                                <h3 className="font-bold text-base text-light-textMain dark:text-dark-textMain mb-1">{stat.title}</h3>
                                <div className="text-sm text-light-textSec dark:text-dark-textSec flex gap-2">
                                    <span>{stat.readTime}</span>
                                    <span>·</span>
                                    <span>{stat.date}</span>
                                    <span>·</span>
                                    <span className="underline cursor-pointer hover:text-light-textMain dark:hover:text-dark-textMain">View story</span>
                                </div>
                                {/* Mobile Stats */}
                                <div className="flex gap-4 sm:hidden mt-2 text-xs text-light-textSec dark:text-dark-textSec">
                                    <span>Pres: {stat.presentations}</span>
                                    <span>Views: {stat.views}</span>
                                    <span>Reads: {stat.reads}</span>
                                </div>
                            </div>
                            <div className="w-24 text-center text-light-textMain dark:text-dark-textMain pt-1 hidden sm:block">{stat.presentations}</div>
                            <div className="w-20 text-center text-light-textMain dark:text-dark-textMain pt-1 hidden sm:block">{stat.views}</div>
                            <div className="w-20 text-center text-light-textMain dark:text-dark-textMain pt-1 hidden sm:block">{stat.reads}</div>
                        </div>
                    ))}
                </div>
            </div>
          </>
        ) : (
          /* Audience Tab Content */
          <div className="animate-fade-in-up">
              <div className="mb-12">
                 <h2 className="font-bold text-xl text-light-textMain dark:text-dark-textMain mb-2">Lifetime</h2>
                 <div className="text-sm text-light-textSec dark:text-dark-textSec">September 27, 2025 – Today (UTC) · Updated daily</div>
              </div>

              <div className="flex flex-col md:flex-row gap-12 md:gap-32 pb-20 border-b border-light-border dark:border-dark-border">
                 <AudienceMetric value="0" label="Followers" subtext="0 from last month" />
                 <AudienceMetric value="0" label="Email Subscribers" subtext="0 from last month" />
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatMetric = ({ label, value, hasInfo }: { label: string, value: string, hasInfo?: boolean }) => (
    <div className="flex flex-col">
        <div className="text-3xl font-bold text-light-textMain dark:text-dark-textMain mb-1">{value}</div>
        <div className="text-sm text-light-textSec dark:text-dark-textSec flex items-center gap-1">
            {label} {hasInfo && <Info size={14} className="text-light-textSec dark:text-dark-textSec" />}
        </div>
    </div>
);

const AudienceMetric = ({ value, label, subtext }: { value: string, label: string, subtext: string }) => (
    <div>
        <div className="text-5xl font-bold text-light-textMain dark:text-dark-textMain mb-3">{value}</div>
        <div className="text-base text-light-textMain dark:text-dark-textMain flex items-center gap-1.5 mb-2">
            {label} <Info size={16} className="text-light-textSec dark:text-dark-textSec cursor-pointer" />
        </div>
        <div className="text-sm text-light-textSec dark:text-dark-textSec">{subtext}</div>
    </div>
);

// Mock Data
const LIFETIME_STATS = [
    { title: "Claude Code : 🎨 Improving Frontend Design with Claude Skills", readTime: "4 min read", date: "Nov 21, 2025", presentations: 3, views: 1, reads: 0 },
    { title: "Optimizing Claude Code ✨", readTime: "2 min read", date: "Nov 13, 2025", presentations: 15, views: 2, reads: 1 },
    { title: "Claude Code Cheatsheet", readTime: "3 min read", date: "Nov 9, 2025", presentations: 20, views: 14, reads: 5 },
    { title: "The Definitive Administrator's Guide to VPS Storage Reclamation", readTime: "3 min read", date: "Nov 8, 2025", presentations: 1, views: 0, reads: 0 },
    { title: "VPS Security Hardening Research Report", readTime: "4 min read", date: "Nov 8, 2025", presentations: 1, views: 0, reads: 0 },
    { title: "A Beginner's Guide to Neural Networks and Transformers", readTime: "4 min read", date: "Nov 6, 2025", presentations: 2, views: 0, reads: 0 },
];

const MockChart = () => {
    // Simple SVG chart mock to resemble the screenshot
    return (
        <div className="w-full h-full relative">
            <svg viewBox="0 0 1000 300" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="0" y1="300" x2="1000" y2="300" stroke="#e5e5e5" strokeWidth="1" className="dark:stroke-gray-700" />
                <line x1="0" y1="200" x2="1000" y2="200" stroke="#f0f0f0" strokeWidth="1" className="dark:stroke-gray-800" />
                <line x1="0" y1="100" x2="1000" y2="100" stroke="#f0f0f0" strokeWidth="1" className="dark:stroke-gray-800" />
                
                {/* Y Axis Labels */}
                <text x="-10" y="300" fontSize="10" fill="#a8a8a8" textAnchor="end">0</text>
                <text x="-10" y="200" fontSize="10" fill="#a8a8a8" textAnchor="end">2</text>
                <text x="-10" y="100" fontSize="10" fill="#a8a8a8" textAnchor="end">4</text>
                <text x="-10" y="0" fontSize="10" fill="#a8a8a8" textAnchor="end">6</text>

                {/* X Axis Labels */}
                <text x="0" y="320" fontSize="10" fill="#a8a8a8">Nov 1</text>
                <text x="333" y="320" fontSize="10" fill="#a8a8a8">Nov 8</text>
                <text x="666" y="320" fontSize="10" fill="#a8a8a8">Nov 15</text>
                <text x="950" y="320" fontSize="10" fill="#a8a8a8">Nov 22</text>

                {/* Data Path 1 (Light Green Area) */}
                <path d="M0,300 L350,300 L400,250 L450,300 L500,100 L550,200 L600,150 L650,300 L750,300 L800,280 L850,300 L900,200 L950,300 L1000,300" 
                      fill="rgba(76, 175, 80, 0.1)" stroke="none" />
                <path d="M0,300 L350,300 L400,250 L450,300 L500,100 L550,200 L600,150 L650,300 L750,300 L800,280 L850,300 L900,200 L950,300 L1000,300" 
                      fill="none" stroke="#4CAF50" strokeWidth="2" opacity="0.5" />
                
                {/* Data Path 2 (Darker Green Peaks - Reads) */}
                <path d="M0,300 L380,300 L420,280 L460,300 L500,200 L550,300 L600,240 L650,300 L820,300 L850,260 L880,300 L1000,300" 
                      fill="rgba(27, 94, 32, 0.3)" stroke="#1B5E20" strokeWidth="2" />

                {/* Dots on points */}
                <circle cx="500" cy="200" r="4" fill="#1B5E20" stroke="white" strokeWidth="2" />
                <circle cx="500" cy="100" r="4" fill="#4CAF50" stroke="white" strokeWidth="2" />
                <circle cx="600" cy="240" r="4" fill="#1B5E20" stroke="white" strokeWidth="2" />
            </svg>
            <div className="flex justify-end gap-4 mt-8 text-xs font-medium">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 opacity-50"></div> <span className="text-light-textSec dark:text-dark-textSec">Views</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-800"></div> <span className="text-light-textSec dark:text-dark-textSec">Reads</span></div>
            </div>
        </div>
    );
}
