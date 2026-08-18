import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, ArrowRight, Sparkles, BookOpen } from 'lucide-react';
import { BLOG_POSTS } from '../data/blogPosts';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema } from '../utils/structuredData';

export function BlogPage() {
  const navigate = useNavigate();

  useSEO({
    title: 'Event Management & Ticketing Blog | Ash-vish Events',
    description: 'Explore expert guides on event planning, wedding checklists, corporate event ideas, concert organizing, and digital QR ticketing in Kolhapur and Maharashtra.',
    keywords: 'event management blog, event planners kolhapur, corporate event ideas, wedding planning checklist india',
    structuredData: generateBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Blog', url: '/blog' }
    ])
  });

  return (
    <div className="min-h-screen bg-[#070707] text-white pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
      
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold tracking-widest uppercase">
          <BookOpen className="w-3.5 h-3.5" />
          Ash-vish Editorial & Guides
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          Event Planning Insights & Guides
        </h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          Expert advice on organizing concerts, planning weddings, managing corporate events, and leveraging digital QR ticketing.
        </p>
      </div>

      {/* Blog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {BLOG_POSTS.map(post => (
          <article
            key={post.slug}
            onClick={() => navigate(`/blog/${post.slug}`)}
            className="group cursor-pointer rounded-3xl bg-[#111] border border-white/10 overflow-hidden shadow-xl hover:border-[#D4AF37]/50 transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="relative h-48 overflow-hidden">
                <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[#D4AF37] text-[10px] font-bold border border-white/10 uppercase tracking-wider">
                  {post.category}
                </div>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" /> {post.readTime}
                  </span>
                </div>
                <h2 className="font-bold text-white text-lg leading-snug group-hover:text-[#D4AF37] transition-colors">
                  {post.title}
                </h2>
                <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                  {post.description}
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 flex items-center justify-between text-xs text-[#D4AF37] font-bold">
              <span>Read Full Guide</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </article>
        ))}
      </div>

    </div>
  );
}
