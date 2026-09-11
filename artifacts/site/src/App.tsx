import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import RecreationHome from "@/pages/RecreationHome";
import Blog from "@/pages/Blog";
import BlogArticle from "@/pages/BlogArticle";
import Discussions from "@/pages/Discussions";
import Support from "@/pages/Support";
import BulkUpload from "@/pages/BulkUpload";
import AppInfo from "@/pages/AppInfo";
import AppLanding from "@/pages/AppLanding";
import SupportalSync from "@/pages/SupportalSync";
import Privacy from "@/pages/Privacy";
import Trails from "@/pages/Trails";
import AndroidPackage from "@/pages/AndroidPackage";
import DeleteAccount from "@/pages/DeleteAccount";
import DeleteData from "@/pages/DeleteData";
import { ThemeProvider } from "@/components/ThemeToggle";
import SiteNav from "@/components/SiteNav";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={RecreationHome} />
      <Route path="/commercial" component={Home} />
      <Route path="/trails" component={Trails} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogArticle} />
      <Route path="/support" component={Support} />
      <Route path="/app" component={AppLanding} />
      {/* Unlisted: reachable by URL only, intentionally absent from site nav. */}
      <Route path="/feedback" component={Discussions} />
      <Route path="/upload" component={BulkUpload} />
      <Route path="/app-info" component={AppInfo} />
      <Route path="/supportal" component={SupportalSync} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/android-package" component={AndroidPackage} />
      <Route path="/delete-account" component={DeleteAccount} />
      <Route path="/delete-data" component={DeleteData} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
           <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
             <SiteNav />
             <Router />
           </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
