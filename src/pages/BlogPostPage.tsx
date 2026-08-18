import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, ArrowLeft, Share2, Sparkles, PartyPopper } from 'lucide-react';
import { BLOG_POSTS } from '../data/blogPosts';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema, generateArticleSchema } from '../utils/structuredData';

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const post = BLOG_POSTS.find(p => p.slug === slug);

  useSEO({
    title: post ? post.title : 'Blog Post | Ash-vish Events',
    description: post ? post.description : 'Read expert event planning guides on Ash-vish Events.',
    keywords: post ? `${post.category}, event planning, ash-vish events, kolhapur event organisers` : undefined,
    type: 'article',
    structuredData: post ? [
      generateBreadcrumbSchema([
        { name: 'Home', url: '/' },
        { name: 'Blog', url: '/blog' },
        { name: post.title, url: `/blog/${post.slug}` }
      ]),
      generateArticleSchema(post)
    ] : undefined
  });

  if (!post) {
    return (
      <div className="min-h-screen bg-[#070707] text-white pt-32 text-center px-4 space-y-4">
        <h1 className="text-2xl font-bold">Blog Post Not Found</h1>
        <button onClick={() => navigate('/blog')} className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-black font-bold text-xs">
          Return to Blog
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-10">
      
      {/* Back button */}
      <button
        onClick={() => navigate('/blog')}
        className="inline-flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
        <span>Back to All Guides</span>
      </button>

      {/* Post Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-bold border border-[#D4AF37]/30 uppercase tracking-wider">
            {post.category}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> {post.date}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-400" /> {post.readTime}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
          {post.title}
        </h1>

        <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-white/10">
          <User className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>By {post.author}</span>
        </div>
      </div>

      {/* Featured Banner Image */}
      <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl h-72 sm:h-96">
        <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
      </div>

      {/* Article Content */}
      <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed space-y-6 text-base sm:text-lg">
        <div className="bg-[#111] p-6 sm:p-10 rounded-3xl border border-white/10 shadow-xl space-y-6">
          {post.content.split('\n\n').map((paragraph, idx) => {
            if (paragraph.startsWith('# ')) {
              return <h1 key={idx} className="text-2xl sm:text-3xl font-extrabold text-white mt-6 mb-3">{paragraph.replace('# ', '')}</h1>;
            }
            if (paragraph.startsWith('## ')) {
              return <h2 key={idx} className="text-xl sm:text-2xl font-bold text-[#D4AF37] mt-5 mb-2">{paragraph.replace('## ', '')}</h2>;
            }
            if (paragraph.startsWith('- ')) {
              return (
                <ul key={idx} className="list-disc pl-5 space-y-1 text-gray-300">
                  {paragraph.split('\n- ').map((item, i) => (
                    <li key={i}>{item.replace('- ', '')}</li>
                  ))}
                </ul>
              );
            }
            return <p key={idx} className="text-gray-300 leading-relaxed">{paragraph}</p>;
          })}
        </div>
      </div>

      {/* CTA Box */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-[#1A1A1A] to-[#111] border border-[#D4AF37]/30 text-center space-y-4 shadow-2xl">
        <h3 className="text-2xl font-bold text-white">Ready to Host Your Next Event?</h3>
        <p className="text-xs sm:text-sm text-gray-300 max-w-lg mx-auto">
          Whether you need full event production or secure digital QR pass ticketing in Kolhapur and across India, Ash-vish Events is here for you.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => navigate('/events')}
            className="px-6 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#F3E5AB] text-black font-extrabold text-xs flex items-center gap-2 cursor-pointer"
          >
            <span>Explore Events & Tickets</span>
          </button>
        </div>
      </div>

    </div>
  );
}
