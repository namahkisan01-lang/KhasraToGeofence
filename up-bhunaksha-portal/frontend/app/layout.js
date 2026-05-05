import "./globals.css";

export const metadata = {
  title: "UP Land Lookup — खसरा खोजें",
  description: "Find any UP plot on Google Maps using its khasra number.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
