import React from 'react';
import { Link } from 'react-router-dom';
import { Twitter, Github, Linkedin, Heart, Mail } from 'lucide-react';
import { Logo } from './Header';
import { TOOLS } from '../mock';

const Footer = () => {
  const col1 = TOOLS.filter((t) => ['organize', 'optimize'].includes(t.category)).slice(0, 6);
  const col2 = TOOLS.filter((t) => t.category.startsWith('convert')).slice(0, 6);
  const col3 = TOOLS.filter((t) => ['edit', 'security'].includes(t.category)).slice(0, 6);

  const LinkCol = ({ title, tools }) => (
    <div>
      <h4 className="font-display font-semibold text-slate-900 dark:text-white mb-4">{title}</h4>
      <ul className="space-y-2.5 text-sm">
        {tools.map((t) => (
          <li key={t.slug}>
            <Link to={`/tool/${t.slug}`} className="text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">{t.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="relative border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#080b13]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
              Every PDF tool you'll ever need, wrapped in one beautiful, private workspace. Free to start, no strings attached.
            </p>
            <div className="flex items-center gap-2 mt-5">
              {[Twitter, Github, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="grid place-items-center w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
              <a href="mailto:lovepdf.support@gmail.com" aria-label="Email support" className="grid place-items-center w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors">
                <Mail className="w-4 h-4" />
              </a>
            </div>
            <a href="mailto:lovepdf.support@gmail.com" className="mt-5 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
              <Mail className="w-4 h-4" /> lovepdf.support@gmail.com
            </a>
          </div>
          <LinkCol title="Organize" tools={col1} />
          <LinkCol title="Convert" tools={col2} />
          <LinkCol title="Edit & Secure" tools={col3} />
        </div>
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} LovePDF. All rights reserved.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">Made with <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> for people who love clean PDFs</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
