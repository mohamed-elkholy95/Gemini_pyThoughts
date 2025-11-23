import { Article, StaffPick, Topic } from './types';

export const MOCK_ARTICLES: Article[] = [
  {
    id: '1',
    title: '7 Secret Google AI Tools That Are 100% FREE! (Goodbye ChatGPT)',
    subtitle: '7 Google AI Tools You Won’t Believe Are Free!',
    author: {
      name: 'Abhishek Ashtekar',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Abhishek',
      bio: 'AI Enthusiast & Tech Writer.',
      followers: '5.4K'
    },
    publication: {
      name: 'Readers Club',
      logo: 'https://api.dicebear.com/7.x/initials/svg?seed=RC&backgroundColor=000000',
      description: '“Readers Club” is a reader-centered publication that delivers valuable insights across diverse topics. With a seamless, rule-free submission process, writers can share content without delays, creating a dynamic space for genuine, impactful stories.'
    },
    thumbnail: 'https://picsum.photos/id/60/800/400',
    date: '4 days ago',
    readTime: '8 min read',
    likes: '116',
    comments: 4,
    toc: [
      { id: 'intro', text: 'Introduction', level: 2 },
      { id: 'tools', text: 'The Tools', level: 2 },
      { id: 'conclusion', text: 'Conclusion', level: 2 }
    ],
    content: `
      <p>Google has been silently releasing some of the most powerful AI tools, and most people are still stuck on ChatGPT. Here are 7 incredible tools that are completely free and will change your workflow forever.</p>
      
      <h3 id="intro">Introduction</h3>
      <p>While OpenAI grabs the headlines, Google's research division has been publishing state-of-the-art models and tools. From image generation to music creation, the ecosystem is vast.</p>
      
      <h3 id="tools">The Tools</h3>
      <p>1. <strong>ImageFX</strong>: Google's answer to Midjourney. High fidelity, text-to-image generation.</p>
      <p>2. <strong>MusicFX</strong>: Generate high-quality music tracks for your videos without copyright strikes.</p>
      <p>3. <strong>NotebookLM</strong>: Your personalized AI research assistant. Upload your documents and chat with them.</p>
      
      <h3 id="conclusion">Conclusion</h3>
      <p>Don't limit yourself to just one tool. Explore the ecosystem and find what works best for your specific needs. The best part? These are all free to try right now.</p>
    `
  },
  {
    id: '2',
    title: 'An approximative world',
    subtitle: 'Today I was walking around and I saw a toddler with a school backpack with a tractor image on it.',
    author: {
      name: 'Thomas Ricouard',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Thomas',
      bio: 'SwiftUI Engineer. French.',
      followers: '4K'
    },
    thumbnail: 'https://picsum.photos/id/20/200/200',
    date: '4d ago',
    readTime: '3 min read',
    likes: '344',
    comments: 6,
    toc: [
      { id: 'observation', text: 'The Observation', level: 2 },
      { id: 'fuzziness', text: 'Embracing Fuzziness', level: 2 }
    ],
    content: `
      <p>Precision is often overrated in our daily lives. We strive for exactness in our schedules, our finances, and our plans. But the world is inherently fuzzy.</p>
      
      <h3 id="observation">The Observation</h3>
      <p>I saw a toddler today with a tractor backpack. It wasn't a specific brand of tractor. It was just "tractor". To him, that was enough. It represented power, noise, and fun.</p>
      
      <h3 id="fuzziness">Embracing Fuzziness</h3>
      <p>As adults, we lose this ability to appreciate the approximation. We get bogged down in the details. Maybe we should embrace a bit more fuzziness in our lives. Knowing "enough" is often more efficient than knowing "everything".</p>
    `
  },
  {
    id: '3',
    title: 'n8n Just Got Insanely Powerful—Here’s What You’re Missing',
    subtitle: 'The automation tool everyone\'s sleeping on just leveled up. Here are the features that turned me from a casual user into a pro.',
    author: {
      name: 'In Write A Catalyst',
      avatar: 'https://api.dicebear.com/7.x/icons/svg?seed=Catalyst',
      bio: 'Tech enthusiast & Automation expert.',
      followers: '8.1K'
    },
    thumbnail: 'https://picsum.photos/id/48/200/200',
    date: '3d ago',
    readTime: '5 min read',
    likes: '512',
    comments: 12,
    toc: [
      { id: 'agents', text: 'AI Agents', level: 2 },
      { id: 'impact', text: 'The Impact on No-Code', level: 2 }
    ],
    content: `
      <p>Automation is the future of productivity. Tools like Zapier and Make have dominated the market, but n8n is the sleeping giant that just woke up.</p>
      
      <h3 id="agents">AI Agents</h3>
      <p>With its recent update, n8n introduced AI agents that can chain thoughts and execute complex workflows without manual intervention. This changes the game for developers and no-code enthusiasts alike. You can now build workflows that reason.</p>
      
      <h3 id="impact">The Impact on No-Code</h3>
      <p>This blurs the line between software engineering and workflow automation. The barrier to entry for building complex, intelligent systems has never been lower.</p>
    `
  }
];

export const STAFF_PICKS: StaffPick[] = [
  {
    author: { name: 'Julia Serano', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Julia' },
    title: 'Lies, Damned Lies, and Transgender Statistics',
    date: '2d ago'
  },
  {
    author: { name: 'Tucker Lieberman', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tucker', isPro: true },
    title: 'We Do Not Have to Keep Doing This (Yet Here’s Another Anti-Trans Book)',
    date: 'Nov 6'
  },
  {
    author: { name: 'Rachel-of-many-names', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rachel' },
    title: '“Reinvent Yourself!” No, thanks.',
    date: 'Nov 13'
  }
];

export const TOPICS: Topic[] = [
  { name: 'Technology', link: '#' },
  { name: 'Mcp Server', link: '#' },
  { name: 'JavaScript', link: '#' },
  { name: 'Hacking', link: '#' },
  { name: 'ChatGPT', link: '#' },
  { name: 'Vibe Coding', link: '#' },
  { name: 'Self Improvement', link: '#' },
];