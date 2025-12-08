package {{NAMESPACE}}

import com.morpheusdata.core.AbstractReportProvider
import com.morpheusdata.core.MorpheusContext
import com.morpheusdata.core.Plugin
import com.morpheusdata.model.OptionType
import com.morpheusdata.model.ReportResult
import com.morpheusdata.model.ReportResultRow
import com.morpheusdata.response.ServiceResponse
import com.morpheusdata.views.HTMLResponse
import com.morpheusdata.views.ViewModel

import groovy.sql.GroovyRowResult
import groovy.sql.Sql
import java.sql.Connection
import io.reactivex.rxjava3.core.Observable

class {{REPORT_CLASS_NAME}} extends AbstractReportProvider {
	protected MorpheusContext morpheusContext
	protected Plugin plugin

	{{REPORT_CLASS_NAME}}(Plugin plugin, MorpheusContext morpheusContext) {
		this.morpheusContext = morpheusContext
		this.plugin = plugin
	}

	/**
	 * Returns the Morpheus Context for interacting with data stored in the Main Morpheus Application
	 *
	 * @return an implementation of the MorpheusContext for running Future based rxJava queries
	 */
	@Override
	MorpheusContext getMorpheus() {
		return this.morpheusContext
	}

	/**
	 * Returns the instance of the Plugin class that this provider is loaded from
	 * @return Plugin class contains references to other providers
	 */
	@Override
	Plugin getPlugin() {
		return this.plugin
	}

	/**
	 * A unique shortcode used for referencing the provided provider. Make sure this is going to be unique as any data
	 * that is seeded or generated related to this provider will reference it by this code.
	 * @return short code string that should be unique across all other plugin implementations.
	 */
	@Override
	String getCode() {
		return '{{REPORT_CODE}}'
	}

	/**
	 * Provides the provider name for reference when adding to the Morpheus Orchestrator
	 * NOTE: This may be useful to set as an i18n key for UI reference and localization support.
	 *
	 * @return either an English name of a Provider or an i18n based key that can be scanned for in a properties file.
	 */
	@Override
	String getName() {
		return '{{REPORT_NAME}}'
	}

	/**
	 * Returns the description of this report provider
	 * @return String
	 */
	@Override
	String getDescription() {
		return '{{REPORT_DESCRIPTION}}'
	}

	/**
	 * Returns the category of the report this report provider provides
	 * @return String
	 */
	@Override
	String getCategory() {
		return '{{REPORT_CATEGORY}}'
	}

	/**
	 * Returns if this report can only be viewed by the account that owns it
	 * @return Boolean
	 */
	@Override
	Boolean getOwnerOnly() {
		return {{OWNER_ONLY}}
	}

	/**
	 * Returns if this report can only be run on the master account
	 * @return Boolean
	 */
	@Override
	Boolean getMasterOnly() {
		return {{MASTER_ONLY}}
	}

	/**
	 * Returns an array of option types to configure the report
	 * @return List<OptionType>
	 */
	@Override
	List<OptionType> getOptionTypes() {
		return []
	}

	/**
	 * Validates any provided options that are being passed to the report provider
	 * @param opts option map to validate
	 * @return ServiceResponse
	 */
	@Override
	ServiceResponse validateOptions(Map opts) {
		return ServiceResponse.success()
	}

	/**
	 * Processes the report and returns a ReportResult
	 * @param reportType the reportType this report belongs to
	 * @param opts any provided options
	 * @param buildHtml flag to include HTML generation
	 * @return ServiceResponse<ReportResult>
	 */
	@Override
	ServiceResponse<ReportResult> process(com.morpheusdata.model.ReportType reportType, Map<String, Object> opts, Boolean buildHtml = true) {
		log.debug("Processing {{REPORT_NAME}} report...")
		
		try {
			Connection dbConnection

			try {
				dbConnection = morpheus.report.getReadOnlyDatabaseConnection().blockingGet()
				
				if (dbConnection == null) {
					log.error("Failed to obtain database connection")
					return ServiceResponse.error("Failed to obtain database connection")
				}

				String sql = """{{SQL_QUERY}}"""

				log.debug("Executing SQL: ${sql}")
				
				Sql sqlInstance = new Sql(dbConnection)
				List<GroovyRowResult> results = sqlInstance.rows(sql)
				
				log.debug("Query returned ${results.size()} rows")
				
				List<Map<String, Object>> reportData = []
				List<Map<String, Object>> headerData = []
				
				// Process results
				for (GroovyRowResult row : results) {
					Map<String, Object> data = [:]
					row.each { key, value ->
						data[key.toString()] = value
					}
					reportData << [dataMap: data]
				}
				
				// TODO: Add summary statistics calculation here if needed
				// headerData << [dataMap: [totalRecords: results.size()]]
				
				ReportResult reportResult = new ReportResult()
				reportResult.data = reportData
				reportResult.headers = headerData
				
				if (buildHtml) {
					reportResult = generateReportHTML(reportResult, reportType, opts)
				}
				
				log.debug("Report processing completed successfully")
				return ServiceResponse.success(reportResult)
				
			} finally {
				morpheus.report.releaseDatabaseConnection(dbConnection)
			}
			
		} catch (Exception e) {
			log.error("Error processing {{REPORT_NAME}} report: ${e.message}", e)
			return ServiceResponse.error("Error processing report: ${e.message}")
		}
	}

	/**
	 * Generates HTML content for the report
	 * @param reportResult the report data
	 * @param reportType the report type
	 * @param opts report options
	 * @return ReportResult with HTML content
	 */
	private ReportResult generateReportHTML(ReportResult reportResult, com.morpheusdata.model.ReportType reportType, Map<String, Object> opts) {
		ViewModel<String> model = new ViewModel<>()
		model.object = reportResult.data
		HTMLResponse output = getRenderer().renderTemplate("hbs/{{REPORT_TEMPLATE}}", model)
		
		reportResult.htmlContent = output.html
		reportResult.data = reportResult.data
		reportResult.headers = reportResult.headers
		
		return reportResult
	}
}