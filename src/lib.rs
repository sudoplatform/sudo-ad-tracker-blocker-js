extern crate console_error_panic_hook;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct FilterEngine {
      engine: adblock::engine::Engine,
}

#[wasm_bindgen]
impl FilterEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(list: &str) -> FilterEngine {
        console_error_panic_hook::set_once();

        let mut filter_set = adblock::lists::FilterSet::new(true);
        let parse_options = adblock::lists::ParseOptions {
          ..adblock::lists::ParseOptions::default()
        };
        filter_set.add_filter_list(&list, parse_options);

        FilterEngine { engine: adblock::engine::Engine::from_filter_set(filter_set, false) }
    }

    #[wasm_bindgen(js_name = checkNetworkUrlsMatched)]
    pub fn check_network_urls_matched(&self, url:String, source_url:String, request_type:String) -> bool {
      let result = self.engine.check_network_urls(&url, &source_url, &request_type);
      return result.matched;
    }
}
