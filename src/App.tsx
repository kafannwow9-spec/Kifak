import { useEffect, useState } from 'react';

export default function App() {
  const [tokenSet, setTokenSet] = useState(false);

  useEffect(() => {
    // In a real app, we'd check the backend, but here we just check if the env var is likely set
    // This is just for the UI display
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setTokenSet(data.tokenSet))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-8 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-[#151619] border border-white/10 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
          Discord Leave Bot
        </h1>
        
        <div className="space-y-6">
          <section className="bg-black/20 p-4 rounded-xl border border-white/5">
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${tokenSet ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
              حالة البوت
            </h2>
            <p className="text-gray-400">
              {tokenSet 
                ? "البوت يعمل الآن! يمكنك استخدامه في ديسكورد." 
                : "يرجى إضافة DISCORD_TOKEN في إعدادات الأسرار (Secrets) لتشغيل البوت."}
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">الأوامر المتاحة</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <code className="bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded text-sm font-mono">/مسؤولين-الطلبات</code>
                <span className="text-gray-300">لتحديد رتب المسؤولين عن الإجازات والاستقالات.</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded text-sm font-mono">/طلب-اجازة</code>
                <span className="text-gray-300">لإرسال رسالة طلب الإجازة في الروم الحالي.</span>
              </li>
              <li className="flex items-start gap-3">
                <code className="bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded text-sm font-mono">/استقالة</code>
                <span className="text-gray-300">لطلب الاستقالة (قيد التطوير).</span>
              </li>
            </ul>
          </section>

          <div className="pt-4 text-sm text-gray-500 italic">
            * ملاحظة: الأوامر متاحة فقط للمسؤولين (Administrator).
          </div>
        </div>
      </div>
    </div>
  );
}
