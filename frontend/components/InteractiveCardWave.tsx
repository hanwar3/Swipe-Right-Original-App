import { useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { CreditCardDisplay, type CardData } from './CreditCardDisplay';

function WaveCard({
  card,
  index,
  total,
  scrollYProgress,
}: {
  card: CardData;
  index: number;
  total: number;
  scrollYProgress: MotionValue<number>;
}) {
  const phase = 0.25 + (index / Math.max(total - 1, 1)) * 0.5;

  const y = useTransform(scrollYProgress, [phase - 0.12, phase, phase + 0.12], [40, -24, 40]);
  const rotate = useTransform(scrollYProgress, [phase - 0.12, phase, phase + 0.12], [6, -3, 6]);
  const scale = useTransform(scrollYProgress, [phase - 0.12, phase, phase + 0.12], [0.9, 1.06, 0.9]);
  const opacity = useTransform(scrollYProgress, [phase - 0.18, phase - 0.06, phase + 0.06, phase + 0.18], [0.35, 1, 1, 0.35]);

  return (
    <motion.div
      style={{ y, rotate, scale, opacity }}
      whileTap={{ scale: 1.1 }}
      className="snap-center"
    >
      <CreditCardDisplay card={card} />
    </motion.div>
  );
}

export function InteractiveCardWave({ cards }: { cards: CardData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  return (
    <div ref={containerRef} className="py-8">
      <div className="flex gap-4 overflow-x-auto px-6 pb-6 snap-x snap-mandatory scrollbar-hide">
        {cards.map((card, i) => (
          <WaveCard
            key={card.id}
            card={card}
            index={i}
            total={cards.length}
            scrollYProgress={scrollYProgress}
          />
        ))}
      </div>
    </div>
  );
}
