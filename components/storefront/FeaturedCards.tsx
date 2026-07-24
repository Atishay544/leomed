import Link from 'next/link'
import Image from 'next/image'

type CardBanner = {
  id: string
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  link_text: string | null
  bg_color: string | null
  text_color: string | null
}

export default function FeaturedCards({ cards }: { cards: CardBanner[] }) {
  if (!cards.length) return null

  return (
    <section className="max-w-350 mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {cards.slice(0, 2).map(card => (
          <Link
            key={card.id}
            href={card.link_url ?? '/products'}
            className="group relative overflow-hidden rounded-3xl min-h-[280px] sm:min-h-[340px] flex"
            style={{ backgroundColor: card.bg_color ?? '#f5ede3' }}
          >
            {/* Person / product image — anchored to the right */}
            {card.image_url && (
              <Image
                src={card.image_url}
                alt={card.title ?? ''}
                fill
                className="object-cover object-right group-hover:scale-105 transition-transform duration-700"
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            )}

            {/* Soft left-side gradient so text stays readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent pointer-events-none" />

            {/* Text content — left side */}
            <div className="relative z-10 p-6 sm:p-8 flex flex-col justify-between w-[55%]">
              <div>
                {card.title && (
                  <h3
                    className="text-3xl sm:text-4xl font-bold italic leading-tight drop-shadow-sm"
                    style={{
                      color: card.text_color ?? '#1a1a1a',
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                    }}
                  >
                    {card.title}
                  </h3>
                )}
                {card.subtitle && (
                  <p
                    className="text-sm mt-2 leading-snug"
                    style={{ color: card.text_color ?? '#1a1a1a', opacity: 0.75 }}
                  >
                    {card.subtitle}
                  </p>
                )}
              </div>

              <span className="inline-flex items-center gap-2 self-start mt-6 bg-black text-white text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full group-hover:bg-white group-hover:text-black transition-all duration-300 shadow-md">
                {card.link_text ?? 'View Collection'}
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
