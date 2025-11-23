import React, { useState, useEffect, useRef } from 'react';
import { PenTool, Layout, Users, ArrowRight, CheckCircle, Search } from 'lucide-react';
import { STAFF_PICKS } from '../constants';

interface LandingPageProps {
  onEnter: () => void;
}

const Typewriter = ({ text, speed = 50, startDelay = 500 }: { text: string; speed?: number; startDelay?: number }) => {
  const [displayText, setDisplayText] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setStarted(true);
    }, startDelay);
    return () => clearTimeout(startTimeout);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;

    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.substring(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, started]);

  return (
    <span className="inline-block">
      {displayText}
      <span className="inline-block w-[2px] h-[1em] bg-light-accent ml-1 align-middle animate-blink"></span>
    </span>
  );
};

const useIntersectionObserver = (options = {}) => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.1, ...options });

    observer.observe(element);
    return () => observer.disconnect();
  }, [element, options]);

  return [setElement, isVisible] as const;
};

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const [featuresRef, featuresVisible] = useIntersectionObserver();
  const [galleryRef, galleryVisible] = useIntersectionObserver();

  return (
    <div className="w-full min-h-screen bg-light-body dark:bg-dark-body flex flex-col overflow-x-hidden">
      
      {/* 1. Header Navigation for Landing */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full absolute top-0 left-0 right-0 z-50 text-white">
        <div className="font-logo text-3xl select-none pt-1">
          Pythoughts
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <span className="hidden md:block cursor-pointer hover:text-light-accent transition-colors">Our Story</span>
          <span className="hidden md:block cursor-pointer hover:text-light-accent transition-colors">Membership</span>
          <span className="hidden md:block cursor-pointer hover:text-light-accent transition-colors">Write</span>
          <button 
            onClick={onEnter} 
            className="text-white hover:text-light-accent transition-colors"
          >
            Sign In
          </button>
          <button 
            onClick={onEnter}
            className="bg-light-accent text-brand-dark px-5 py-2.5 rounded-full font-bold hover:bg-white transition-all transform hover:scale-105"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="bg-hero-gradient pt-36 pb-28 px-6 relative overflow-hidden">
        {/* Animated Background shapes */}
        <div className="absolute top-20 right-20 w-96 h-96 bg-white opacity-5 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-10 left-10 w-72 h-72 bg-light-accent opacity-10 rounded-full blur-3xl animate-float-delayed"></div>

        <div className="max-w-5xl mx-auto text-center relative z-10 text-white flex flex-col items-center">
          <h1 className="font-serif font-black text-5xl md:text-7xl leading-tight mb-8">
            Where good ideas <br/> find their <span className="text-light-accent relative inline-block">
              home
              <svg className="absolute w-full h-3 -bottom-1 left-0 text-light-accent opacity-60" viewBox="0 0 100 10" preserveAspectRatio="none">
                 <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="3" fill="none" />
              </svg>
            </span>.
          </h1>
          
          {/* Typing Box */}
          <div className="w-full max-w-2xl bg-black/20 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-12 shadow-2xl transform hover:scale-[1.01] transition-transform duration-500">
             <div className="flex gap-2 mb-4">
                 <div className="w-3 h-3 rounded-full bg-red-400"></div>
                 <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                 <div className="w-3 h-3 rounded-full bg-green-400"></div>
             </div>
             <div className="text-left font-mono text-lg md:text-xl text-white/90 min-h-[3.5rem] flex items-center">
                <span className="text-light-accent mr-3 font-bold">{'>'}</span>
                <Typewriter text="Pythoughts: Where good ideas find their home." startDelay={1000} speed={40} />
             </div>
          </div>

          <p className="font-sans text-xl md:text-2xl text-gray-200 mb-10 max-w-2xl mx-auto leading-relaxed opacity-0 animate-fade-in-up" style={{animationDelay: '0.5s'}}>
            Read and write deep thought-provoking articles in a space designed for clarity, connection, and creators.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 opacity-0 animate-fade-in-up" style={{animationDelay: '0.8s'}}>
            <button 
              onClick={onEnter}
              className="bg-light-accent text-brand-dark text-lg px-8 py-4 rounded-full font-bold shadow-lg hover:shadow-xl hover:bg-white transition-all transform hover:-translate-y-1 flex items-center gap-2"
            >
              Start Writing <ArrowRight size={20} />
            </button>
            <button 
              onClick={onEnter}
              className="bg-transparent border-2 border-white text-white text-lg px-8 py-4 rounded-full font-bold hover:bg-white hover:text-brand-dark transition-all"
            >
              Read Stories
            </button>
          </div>
        </div>
      </section>

      {/* 3. Editor Showcase */}
      <section className="py-24 px-6 bg-light-surface dark:bg-dark-surface">
        <div ref={featuresRef} className={`max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16 transition-all duration-1000 ${featuresVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
          <div className="md:w-1/2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-light-muteAccent text-brand-dark text-xs font-bold mb-4 uppercase tracking-wider">
               <PenTool size={14} /> Created for Writers
            </div>
            <h2 className="font-serif font-bold text-4xl text-light-textMain dark:text-dark-textMain mb-6">
              A distraction-free, powerful rich text editor.
            </h2>
            <p className="text-lg text-light-textSec dark:text-dark-textSec mb-8 leading-relaxed">
              Focus on your words. Our editor gets out of your way when you're writing and is there when you need it. Embed images, code, and tweets effortlessly.
            </p>
            <ul className="space-y-4">
              {['Markdown Support', 'Auto-saving', 'Drag & Drop Images', 'Beautiful Typography'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-light-textMain dark:text-dark-textMain font-medium group">
                  <CheckCircle size={20} className="text-brand-teal group-hover:scale-110 transition-transform" /> {item}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="md:w-1/2 w-full">
            {/* Mock Editor UI */}
            <div className="rounded-xl shadow-2xl bg-white dark:bg-[#1e1e1e] border border-light-border dark:border-dark-border overflow-hidden transform rotate-1 hover:rotate-0 transition-transform duration-500 hover:shadow-3xl">
               <div className="bg-gray-100 dark:bg-[#252525] px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex gap-2">
                 <div className="w-3 h-3 rounded-full bg-red-400"></div>
                 <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                 <div className="w-3 h-3 rounded-full bg-green-400"></div>
               </div>
               <div className="p-8 md:p-12">
                 <div className="w-3/4 h-8 bg-gray-200 dark:bg-gray-700 rounded mb-6 animate-pulse"></div>
                 <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded mb-3"></div>
                 <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded mb-3"></div>
                 <div className="w-2/3 h-4 bg-gray-100 dark:bg-gray-800 rounded mb-8"></div>
                 
                 <div className="flex gap-4 mb-6 p-4 bg-light-secondary dark:bg-dark-secondary rounded-lg border-l-4 border-light-accent">
                    <div className="italic text-light-textSec dark:text-dark-textSec font-serif">"The scariest moment is always just before you start."</div>
                 </div>

                 <div className="w-full h-4 bg-gray-100 dark:bg-gray-800 rounded mb-3"></div>
                 <div className="w-5/6 h-4 bg-gray-100 dark:bg-gray-800 rounded mb-3"></div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Creator Gallery */}
      <section className="py-24 px-6 bg-gray-50 dark:bg-[#0a0a0a]">
        <div ref={galleryRef} className={`max-w-7xl mx-auto transition-all duration-1000 delay-300 ${galleryVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}>
          <div className="text-center mb-16">
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-light-textMain dark:text-dark-textMain mb-4">
              Discover voices that matter
            </h2>
            <p className="text-light-textSec dark:text-dark-textSec text-lg">
              Join a growing community of thinkers, developers, and storytellers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {STAFF_PICKS.concat(STAFF_PICKS).slice(0, 6).map((pick, i) => (
              <div 
                key={i} 
                className="bg-light-surface dark:bg-dark-surface p-6 rounded-xl border border-light-border dark:border-dark-border hover:shadow-lg transition-all duration-300 cursor-pointer group hover:-translate-y-1"
                onClick={onEnter}
              >
                <div className="flex items-center gap-4 mb-4">
                  <img src={pick.author.avatar} className="w-12 h-12 rounded-full border border-gray-100" alt={pick.author.name} />
                  <div>
                    <div className="font-bold text-light-textMain dark:text-dark-textMain group-hover:text-brand-teal transition-colors">{pick.author.name}</div>
                    <div className="text-xs text-light-textSec dark:text-dark-textSec uppercase tracking-wide">Top Writer</div>
                  </div>
                </div>
                <h3 className="font-serif font-bold text-lg text-light-textMain dark:text-dark-textMain leading-snug mb-3">
                  {pick.title}
                </h3>
                <div className="flex items-center justify-between text-sm text-light-textSec dark:text-dark-textSec mt-4 pt-4 border-t border-light-border dark:border-dark-border">
                  <span>{pick.date}</span>
                  <span className="flex items-center gap-1 group-hover:text-brand-teal transition-colors"><Layout size={14} /> Read</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <button 
              onClick={onEnter} 
              className="text-brand-dark dark:text-white font-bold border-b-2 border-light-accent pb-1 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
            >
              Explore all creators
            </button>
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <footer className="bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="font-logo text-2xl text-light-textMain dark:text-dark-textMain">Pythoughts</div>
           <div className="flex flex-wrap justify-center gap-8 text-sm text-light-textSec dark:text-dark-textSec">
              <a href="#" className="hover:text-light-textMain dark:hover:text-dark-textMain">About</a>
              <a href="#" className="hover:text-light-textMain dark:hover:text-dark-textMain">Terms</a>
              <a href="#" className="hover:text-light-textMain dark:hover:text-dark-textMain">Privacy</a>
              <a href="#" className="hover:text-light-textMain dark:hover:text-dark-textMain">Help</a>
              <a href="#" className="hover:text-light-textMain dark:hover:text-dark-textMain">Teams</a>
           </div>
           <div className="text-sm text-light-textSec dark:text-dark-textSec">
             © 2024 Pythoughts Inc.
           </div>
        </div>
      </footer>
    </div>
  );
};