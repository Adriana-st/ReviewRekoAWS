### MAKE SURE TO FOLLOW Tailwind CSS Standards PRECISELY:
- **No Arbitrary Values**: Strictly avoid arbitrary square-bracket notation for spacing, sizing, or typography (e.g., `text-[2.5rem]`, `w-[46.8%]`, `mb-[6rem]`).
- **Use Design Tokens**: Use standard Tailwind utility classes (e.g., `text-4xl`, `w-1/2`, `mb-24`) to maintain design consistency and scale.
- **Nearest Neighbor Principle**: If a specific pixel value is requested, map it to the nearest standard Tailwind scale value.
- **Config First**: If a unique value is absolutely required for the "valerkahere" brand identity, instruct me to add it to `tailwind.config.js` under `theme.extend` rather than hardcoding it in the markup.
- **Cleanliness**: Prioritize readability and "cleanliness" as per the valerkahere project philosophy

* CSS-First: Do not look for a tailwind.config.js. All design tokens must be defined in the @theme block within the main CSS file.
* Token Promotion: If an arbitrary value (e.g., 2.5rem) is needed more than once, define it as a CSS variable in @theme (e.g., --font-size-hero: 2.5rem;) and use the generated utility (e.g., text-hero).
* Naming Convention: Use semantic names for Tier 2 tokens (e.g., hero, content-max, brand-primary).

* Instead of text-[2.5rem], use text-hero.
* Instead of mb-[6rem], use mb-island.
* Instead of w-[46.8%], use w-hero-img.

YOU MUST ADHERE TO MODERN TAILWIND STANDARDS
PREVENT AND FIX THESE WARNINGS:
- The class `z-[2]` can be written as `z-2`
- so, instead of `z-[2]` YOU MUST USE MODERN TAILWIND CSS V4 STANDARDS like `z-2`
- The class `lg:max-w-[400px]` can be written as `lg:max-w-100`
- The class `max-w-[250px]` can be written as `max-w-62.5`

