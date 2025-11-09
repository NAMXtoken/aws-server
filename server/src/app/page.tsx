import {
    Check,
    Clock,
    Cloud,
    Database,
    DollarSign,
    FileSpreadsheet,
    Mail,
    Shield,
    TrendingUp,
} from 'lucide-react'
import Image from 'next/image'
import { Button } from './components/button'
import { Card } from './components/card'

const Index = () => {
    return (
        <div className="min-h-screen bg-(--gradient-hero)">
            {/* Navigation Bar */}
            <nav className="fixed w-full pt-3 top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <a
                            href="https://factual-gecko-viable.ngrok-free.app"
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                        >
                            Bynd POS
                        </a>
                        <div className="hidden md:flex items-center gap-8">
                            <a
                                href="#features"
                                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                                Features
                            </a>
                            <a
                                href="#benefits"
                                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                                Benefits
                            </a>
                            <a
                                href="#how-it-works"
                                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                                How It Works
                            </a>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="container mx-auto px-4 flex items-center min-h-screen">
                <div className="grid lg:grid-cols-2 gap-12 items-center w-full py-16">
                    <div className="space-y-8 animate-fade-in">
                        <div className="inline-block px-4 py-2 bg-primary/10 rounded-full">
                            <span className="text-primary font-semibold text-sm">
                                Built on Google Workspace
                            </span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                            Your Only POS System,{' '}
                            <span className="bg-clip-text text-transparent bg-(--gradient-primary)">
                                Powered by Google
                            </span>
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                            The perfect Point of Sale solution for HORECA
                            businesses just starting out. Familiar Google tools,
                            your data, zero learning curve.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                variant="outline"
                                size="xl"
                                className="group"
                            >
                                Get Started Free
                                <span className="group-hover:translate-x-1 transition-transform">
                                    →
                                </span>
                            </Button>
                            <Button variant="outline" size="xl">
                                Watch Demo
                            </Button>
                        </div>
                        <div className="flex items-center gap-8 text-sm text-muted-foreground pt-4">
                            <div className="flex items-center gap-2">
                                <Check className="w-5 h-5 text-accent" />
                                <span>No credit card required</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Check className="w-5 h-5 text-accent" />
                                <span>Setup in minutes</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative animate-scale-in lg:animate-slide-up">
                        <div className="absolute inset-0 bg-(--gradient-primary) opacity-20 blur-3xl rounded-full"></div>
                        <Image
                            width="200"
                            height="200"
                            src="/images/hero/hero.jpg"
                            alt="Bynd POS Dashboard Interface"
                            className="relative rounded-2xl shadow-(--shadow-medium) w-full"
                        />
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section
                id="features"
                className="container mx-auto px-4 py-16 md:py-24"
            >
                <div className="text-center max-w-3xl mx-auto mb-16 space-y-4 animate-fade-in">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                        Why Bynd POS is Different
                    </h2>
                    <p className="text-lg text-muted-foreground">
                        We leverage the power of Google Workspace so you can
                        focus on running your business, not learning new
                        software.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileSpreadsheet className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Google Sheets Database
                        </h3>
                        <p className="text-muted-foreground">
                            Your sales data lives in Google Sheets. Track
                            everything in real-time, create custom reports, and
                            access your data anywhere.
                        </p>
                    </Card>

                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in [animation-delay:100ms] hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Cloud className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Google Drive Storage
                        </h3>
                        <p className="text-muted-foreground">
                            Store menu images, receipts, and documents directly
                            in your Drive. Everything organized, accessible, and
                            backed up automatically.
                        </p>
                    </Card>

                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in [animation-delay:200ms] hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Mail className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Gmail Notifications
                        </h3>
                        <p className="text-muted-foreground">
                            Receive daily reports, alerts, and summaries
                            straight to your Gmail. Stay informed without
                            logging into another platform.
                        </p>
                    </Card>

                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in [animation-delay:300ms] hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Your Data, Your Control
                        </h3>
                        <p className="text-muted-foreground">
                            No vendor lock-in. Your data is stored in your own
                            Google account. Export, analyze, or migrate anytime
                            you want.
                        </p>
                    </Card>

                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in [animation-delay:400ms] hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Setup in Minutes
                        </h3>
                        <p className="text-muted-foreground">
                            Already know Google Sheets? You&apos;re 90% there.
                            Our intuitive interface means zero learning curve
                            for your team.
                        </p>
                    </Card>

                    <Card className="p-8 space-y-4 hover:shadow-(--shadow-medium) transition-all duration-300 bg-card border-border animate-fade-in [animation-delay:500ms] hover:scale-[1.02]">
                        <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Transparent Pricing
                        </h3>
                        <p className="text-muted-foreground">
                            No hidden fees or per-location charges. Simple,
                            straightforward pricing perfect for businesses just
                            starting out.
                        </p>
                    </Card>
                </div>
            </section>

            {/* Benefits Section */}
            <section
                id="benefits"
                className="container mx-auto px-4 py-16 md:py-24"
            >
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <div className="space-y-8 animate-fade-in">
                        <div className="space-y-4">
                            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                                Built for HORECA Startups
                            </h2>
                            <p className="text-lg text-muted-foreground">
                                We understand the challenges of launching your
                                first restaurant, café, or hotel. Bynd POS grows
                                with you from day one.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-foreground">
                                        No Technical Setup
                                    </h4>
                                    <p className="text-muted-foreground">
                                        Connect your Google account and
                                        you&apos;re ready to take orders. No
                                        servers, no installations, no IT
                                        department needed.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-foreground">
                                        Instant Reporting
                                    </h4>
                                    <p className="text-muted-foreground">
                                        All your sales data flows into Google
                                        Sheets automatically. Create pivot
                                        tables, charts, and custom reports with
                                        tools you already know.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-foreground">
                                        Collaborate with Your Team
                                    </h4>
                                    <p className="text-muted-foreground">
                                        Share your Google Sheets with
                                        accountants, partners, or staff.
                                        Everyone works with the same live data.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="shrink-0 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-foreground">
                                        Scale Without Limits
                                    </h4>
                                    <p className="text-muted-foreground">
                                        From your first location to your tenth,
                                        Bynd POS adapts. Google&apos;s
                                        infrastructure means you never outgrow
                                        your POS system.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative animate-scale-in">
                        <Card className="p-8 bg-card border-border shadow-(--shadow-medium)">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between pb-4 border-b border-border">
                                    <h3 className="text-xl font-semibold text-foreground">
                                        Daily Sales Report
                                    </h3>
                                    <Database className="w-6 h-6 text-primary" />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">
                                            Total Sales
                                        </span>
                                        <span className="text-2xl font-bold text-foreground">
                                            $2,847.50
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">
                                            Orders
                                        </span>
                                        <span className="text-xl font-semibold text-foreground">
                                            142
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">
                                            Avg. Order Value
                                        </span>
                                        <span className="text-xl font-semibold text-foreground">
                                            $20.05
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-border">
                                    <div className="flex items-center gap-2 text-accent">
                                        <TrendingUp className="w-5 h-5" />
                                        <span className="font-semibold">
                                            +12.5% from yesterday
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        View full report in Google Sheets
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section
                id="how-it-works"
                className="container mx-auto px-4 py-16 md:py-24"
            >
                <div className="text-center max-w-3xl mx-auto mb-16 space-y-4 animate-fade-in">
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                        How Bynd POS Works
                    </h2>
                    <p className="text-lg text-muted-foreground">
                        Get up and running in three simple steps
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    <div className="text-center space-y-4 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-(--gradient-primary) text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto shadow-(--shadow-soft)">
                            1
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Connect Your Google Account
                        </h3>
                        <p className="text-muted-foreground">
                            Sign in with Google and authorize Bynd POS to access
                            your Drive and Sheets. Takes less than 2 minutes.
                        </p>
                    </div>

                    <div className="text-center space-y-4 animate-fade-in [animation-delay:100ms]">
                        <div className="w-16 h-16 rounded-full bg-(--gradient-primary) text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto shadow-(--shadow-soft)">
                            2
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Add Your Menu
                        </h3>
                        <p className="text-muted-foreground">
                            Upload your menu items with photos. We&apos;ll
                            create organized sheets in your Drive automatically.
                        </p>
                    </div>

                    <div className="text-center space-y-4 animate-fade-in [animation-delay:200ms]">
                        <div className="w-16 h-16 rounded-full bg-(--gradient-primary) text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto shadow-(--shadow-soft)">
                            3
                        </div>
                        <h3 className="text-xl font-semibold text-foreground">
                            Start Taking Orders
                        </h3>
                        <p className="text-muted-foreground">
                            Use our tablet app or web interface to process
                            orders. Everything syncs to your Google Sheets in
                            real-time.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="container mx-auto px-4 py-16 md:py-24">
                <Card className="relative overflow-hidden bg-(--gradient-primary) border-0 shadow-(--shadow-medium)">
                    <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                    <div className="relative px-8 py-16 md:py-20 text-center space-y-8 max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-black">
                            Ready to Launch Your HORECA Business?
                        </h2>
                        <p className="text-lg md:text-xl text-black/95">
                            Join hundreds of restaurants, cafés, and hotels
                            using Bynd POS to manage their operations with
                            Google Workspace.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button>
                                Start Free Trial
                                <span className="group-hover:translate-x-1 transition-transform">
                                    →
                                </span>
                            </Button>
                            <Button
                                variant="outline"
                                size="xl"
                                className="border-white/30 hover:bg-white/10 text-black hover:text-black bg-transparent"
                            >
                                Schedule a Demo
                            </Button>
                        </div>
                        <p className="text-sm text-black/90">
                            No credit card required • Setup in minutes • Cancel
                            anytime
                        </p>
                    </div>
                </Card>
            </section>

            {/* Footer */}
            <footer className="container mx-auto px-4 py-12 border-t border-border">
                <div className="grid md:grid-cols-4 gap-8">
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-foreground">
                            Bynd POS
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            The first POS system built entirely on Google
                            Workspace for HORECA businesses.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-foreground">
                            Product
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Features
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Pricing
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Demo
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    FAQ
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-foreground">
                            Company
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    About Us
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Blog
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Careers
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Contact
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div className="space-y-4">
                        <h4 className="font-semibold text-foreground">Legal</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Privacy Policy
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Terms of Service
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="hover:text-primary transition-colors"
                                >
                                    Cookie Policy
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
                    <p>&copy; 2025 Bynd POS. All rights reserved.</p>
                </div>
            </footer>
        </div>
    )
}

export default Index
