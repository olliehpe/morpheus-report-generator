/*
* Copyright 2024 the original author or authors.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*    http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
package {{NAMESPACE}}

import com.morpheusdata.core.Plugin
import com.morpheusdata.model.Permission

class {{PLUGIN_CLASS_NAME}} extends Plugin {

    @Override
    String getCode() {
        return '{{PLUGIN_CODE}}'
    }

    @Override
    void initialize() {
        this.setName("{{PLUGIN_NAME}}")
        this.setDescription("{{PLUGIN_DESCRIPTION}}")
        this.setAuthor("{{PLUGIN_AUTHOR}}")

        // Register the report provider
        this.registerProvider(new {{REPORT_CLASS_NAME}}(this, this.morpheus))
    }

    /**
     * Called when a plugin is being removed from the plugin manager (aka Uninstalled)
     */
    @Override
    void onDestroy() {
        //nothing to do for now
    }
}