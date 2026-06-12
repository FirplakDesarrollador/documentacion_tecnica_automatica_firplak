import localFont from 'next/font/local';
import { Lato, Montserrat, Open_Sans, Poppins, Roboto } from 'next/font/google';

export const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lato',
  display: 'swap',
});

export const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  display: 'swap',
});

export const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-roboto',
  display: 'swap',
});

export const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-poppins',
  display: 'swap',
});

export const orborn = localFont({
  src: '../../artifacts/Orborn/OTF/Orborn-Medium.otf',
  variable: '--font-orborn',
  display: 'swap',
  weight: '500',
  style: 'normal',
});

export const mozaicGeo = localFont({
  src: [
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-thin.otf',
      weight: '100',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-extralight.otf',
      weight: '200',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-light.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-semibold.otf',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-bold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-extrabold.otf',
      weight: '800',
      style: 'normal',
    },
    {
      path: '../../artifacts/mozaic-font-family-2/mozaicgeo-black.otf',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-mozaic-geo',
  display: 'swap',
});
